/**
 * Person-only acts (REQ-FLOW-102) and the unattended push rule (REQ-FLOW-120):
 * the table the shell guard and Claude Code's deny and ask rows share.
 *
 * **Person-only acts** are never the main thread's own to run, attended
 * or not: a force push, a push of a tag or of the default branch (named, or
 * implied by a refspec-less push or `HEAD` while on it), a remote branch
 * deletion, a tag, a merge or a review approval, `gh pr ready`, a release, a publish, a secret,
 * variable, protection or ruleset write, a write to the repository itself (its
 * default branch, visibility or name, its deletion, archiving or unarchiving, or transfer) and a branch
 * rename. {@link personOnlyVerdict} reads a
 * command line for them; {@link CLAUDE_DENY_ROWS} and {@link CLAUDE_ASK_ROWS} are
 * the part a Claude Code rule can say, so the settings layer and the guard agree.
 *
 * **Ask or refuse** (REQ-FLOW-102, REQ-FLOW-124). Each rule has a class: an act
 * that can be undone is ask-class, and a deletion, a force push or an act that
 * cannot be undone is refuse-class. The verdict collects every act a line holds
 * and is `ask: true` only when all of them are ask-class, so a refused act
 * never rides an approval; `deny` stays true on every person-only verdict.
 *
 * **While a run is unattended** the run verbs (`stamity run checkpoint`, `run
 * end`) are the only push path: {@link unattendedPushVerdict} refuses any raw
 * `git push` (`git subtree push` among them), `gh pr create`, `gh pr edit`, `gh pr close` or `gh pr reopen`, a `gh repo` form that
 * pushes, a write of a git remote, and a REST write that moves a branch or a pull request, so the held paths and the
 * last secret scan cannot be stepped around and the run verbs push where the run started. A reply on a comments endpoint passes. Whether a run is
 * unattended is the guard's to read (u14), not this module's.
 *
 * **Embedded as source.** The emitted shell guard (u14) carries both verdicts as
 * their own source text, as `./scripts.ts` carries `normalizeForScreen`, so
 * each function is self-contained: nothing inside its body names a binding
 * outside it. The shell-reading helpers both need are therefore written twice,
 * once in each body, between `shell-reading` markers, and
 * `test/hooks/personOnly.test.ts` holds the two copies equal.
 *
 * **What the text cannot show.** A command reaches the guard as text, so a
 * respelling the text hides — a git or shell alias, a gh alias or extension
 * (refused unattended), a computed `sh -c "$(…)"`,
 * a PowerShell `-EncodedCommand` or a line piped into `iex` or a shell,
 * a bare tag name the context's `tags` does not list, a repository's own push
 * configuration, a `git update-ref --stdin` text read from a file, a GraphQL
 * mutation or a REST body read from a file where the
 * API's default is not the default branch, a REST target held in a variable — passes. A line nested past four
 * levels is not read: both verdicts throw a coded `NESTING_DEPTH` error, which
 * the guard refuses; an HTTP call whose method or targets the line cannot show (a
 * method holding `$` or a backtick (pr/83), a
 * curl or wget configuration file, a curl write its globbing expands, a wget
 * write reading its targets from a file) throws a coded `HTTP_TARGET_HIDDEN`
 * one, refused the same way. The tests assert
 * that residual as allowed so it stays written down; `SECURITY.md` names it, and the
 * pre-flight's REST check that the account cannot push to the default branch
 * (REQ-FLOW-101) is the wall behind this guard.
 *
 * Pure: no imports, no filesystem, no process.
 */

/** The person-only rule ids, in the order the guard's reasons name them. */
export type PersonOnlyRuleId =
  | "force-push"
  | "push-default"
  | "push-tags"
  | "push-delete"
  | "tag"
  | "pr-merge"
  | "pr-ready"
  | "release"
  | "publish"
  | "secrets"
  | "protection"
  | "tag-delete"
  | "release-delete"
  | "secrets-delete"
  | "repo-delete"
  | "repo-irreversible"
  | "protection-delete"
  | "unpublish";

/** One person-only act: its rule id, what the person keeps, and whether it is ask-class (it can be undone). */
export interface PersonOnlyRule {
  readonly id: PersonOnlyRuleId;
  readonly act: string;
  readonly ask: boolean;
}

/** Every person-only act, one row per rule id {@link personOnlyVerdict} returns. */
export const PERSON_ONLY_RULES: readonly PersonOnlyRule[] = [
  {
    id: "force-push",
    act: "a force push (`-f`, `--force`, `--force-with-lease`, `--force-if-includes`, a `+` refspec, `--mirror`, a forced REST or GraphQL ref update)",
    ask: false,
  },
  {
    id: "push-default",
    act: "a push to the default branch, named, matched by a pattern refspec or implied by a refspec-less push or `HEAD` while on it, or a REST or GraphQL commit or merge onto it",
    ask: true,
  },
  {
    id: "push-tags",
    act: "a push of tags (`--tags`, `--follow-tags`, `--all`, `tag <name>`, a refspec naming a tag: `refs/tags/…`, `tags/…` or a local tag's bare name, a REST or GraphQL tag ref)",
    ask: true,
  },
  {
    id: "push-delete",
    act: "a remote branch deletion (`--delete`, `-d`, `--prune`, a `:ref` refspec, `gh pr close` or `gh pr merge` with `--delete-branch`, a REST or GraphQL ref deletion, a GraphQL ref update to the zero sha or one the line cannot show)",
    ask: false,
  },
  { id: "tag", act: "creating a tag (`git tag` beyond listing)", ask: true },
  {
    id: "pr-merge",
    act: "merging a pull request or approving a review of one (`gh pr merge`, `gh pr review --approve`, the REST or GraphQL merge, a REST or GraphQL review with the event `APPROVE`)",
    ask: true,
  },
  { id: "pr-ready", act: "marking a pull request ready for review (`gh pr ready`)", ask: true },
  { id: "release", act: "creating, editing or uploading to a release (`gh release` beyond list, view, download)", ask: true },
  { id: "publish", act: "publishing a package (`npm`, `pnpm`, `yarn`, `bun` publish, `npm dist-tag add`)", ask: true },
  { id: "secrets", act: "writing a secret or a variable (`gh secret`, `gh variable` beyond list and a variable's get, their REST paths)", ask: true },
  {
    id: "protection",
    act: "writing branch protection, a ruleset or a custom property a ruleset can target by, renaming a branch, or writing the repository's settings (`gh repo edit` but `--visibility`, `gh repo rename`, `gh repo archive` or `gh repo unarchive`, a REST PATCH on the repository)",
    ask: true,
  },
  {
    id: "tag-delete",
    act: "deleting or moving a tag (a remote tag deletion, `git tag -d` or `-f`, a `git update-ref` or `git symbolic-ref` deletion under `refs/tags/`)",
    ask: false,
  },
  { id: "release-delete", act: "deleting a release or an asset (`gh release delete`, `delete-asset`, `upload --clobber`, a REST DELETE)", ask: false },
  { id: "secrets-delete", act: "deleting a secret or a variable (`gh secret` or `gh variable` `delete` or `remove`, a REST DELETE)", ask: false },
  { id: "repo-delete", act: "deleting the repository (`gh repo delete`, a REST DELETE on the repository)", ask: false },
  {
    id: "repo-irreversible",
    act: "changing the repository's visibility or owner (`gh repo edit --visibility`, `gh repo transfer`, a REST PATCH whose body holds `visibility` or `private` or that the line cannot show, a REST transfer)",
    ask: false,
  },
  {
    id: "protection-delete",
    act: "deleting branch protection, a ruleset or a custom property (a REST DELETE on them, GraphQL's `deleteBranchProtectionRule`, `deleteRepositoryRuleset`, `deleteRepositoryCustomProperty`)",
    ask: false,
  },
  { id: "unpublish", act: "withdrawing a published package or tag (`npm unpublish`, `npm dist-tag rm`)", ask: false },
];

/**
 * A command's person-only verdict: allowed, or denied naming its rule, the act and whether every act the line holds
 * is ask-class (`ask`); a line with a refuse-class act names that act.
 */
export type PersonOnlyVerdict =
  | { deny: false }
  | { deny: true; rule: PersonOnlyRuleId; act: string; reason: string; ask: boolean };

/** A command's verdict under the unattended push rule. */
export type UnattendedPushVerdict = { deny: false } | { deny: true; reason: string };

/** The branch context an implied push destination is read against. */
export interface PersonOnlyContext {
  /** The repository's default branch names; `main` and `master` always count too. */
  readonly defaultBranches: readonly string[];
  /** The checked-out branch, or `null` when detached or unread. */
  readonly currentBranch: string | null;
  /**
   * The repository's local tag names (`v1.0.0`, or `refs/tags/v1.0.0`), so a
   * refspec naming a tag by its bare name reads as a tag push; `[]` when unread.
   */
  readonly tags: readonly string[];
}

/**
 * The GitHub MCP server's person-only tools, by name, in Claude Code's MCP rule form
 * (`mcp__<server>__<tool>`, the server under the `github` key the engine writes to
 * `.mcp.json`), each with its class: a merge or a push made as a tool call is no shell
 * call, so neither the prefix rows nor the shell reading see it (review/214, review/226).
 * A row cannot read a tool's arguments, so each tool is classed whole: `delete_file` is a
 * commit, not a ref deletion, and asks; `delete_repository` alone is refused. The shell
 * guard also runs on these tools (REQ-FLOW-120), and refuses every one while a run is
 * unattended, since a settings row cannot read the mode.
 */
export const GITHUB_MCP_ROWS: readonly { readonly row: string; readonly ask: boolean }[] = [
  { row: "mcp__github__merge_pull_request", ask: true },
  { row: "mcp__github__push_files", ask: true },
  { row: "mcp__github__create_or_update_file", ask: true },
  { row: "mcp__github__delete_file", ask: true },
  { row: "mcp__github__update_pull_request_branch", ask: true },
  // review/226: these names were read on 2026-10-16 from the GitHub MCP server's README and its `pkg/github/`
  // sources. `create_pull_request_review`, `submit_pending_pull_request_review`, `update_pull_request_state` and
  // `update_pull_request_draft_state` are registered behind its `pull_requests_granular` flag. Like the rows above,
  // these name a server configured as `github`; a server given another name escapes them.
  { row: "mcp__github__pull_request_review_write", ask: true },
  { row: "mcp__github__create_pull_request_review", ask: true },
  { row: "mcp__github__submit_pending_pull_request_review", ask: true },
  { row: "mcp__github__update_pull_request", ask: true },
  { row: "mcp__github__update_pull_request_state", ask: true },
  { row: "mcp__github__update_pull_request_draft_state", ask: true },
  { row: "mcp__github__create_branch", ask: true },
  { row: "mcp__github__delete_repository", ask: false },
  // pr/78: a pull request opened as a tool call skips the run verbs' draft and their title and body screen; the guard
  // refuses it while a run is unattended, and attended it asks.
  { row: "mcp__github__create_pull_request", ask: true },
];

/**
 * The person-only rows Claude Code's settings refuse, for `permissions.deny` (u20,
 * REQ-FLOW-124): the deletions, force pushes and acts that cannot be undone a rule
 * can say. A form a rule cannot say (a REST write, a refspec deletion behind an ask
 * prefix) is the shell guard's alone.
 *
 * Each prefix row (`Bash(<prefix>:*)`) holds a prefix {@link personOnlyVerdict} refuses.
 * The mid-pattern rows (`Bash(<prefix> * <flag>*)`, no `:*`) are there because a `*`
 * inside a Bash rule matches anywhere on the line (measured on Claude Code 2.1.302,
 * 2026-10-18): an ask prefix row ({@link CLAUDE_ASK_ROWS}) also matches a line that
 * adds a refused flag later (`git push --tags --force`), and the client reads a deny
 * row before an ask row, so where no hook runs the line is still refused. A respelling
 * no row names stays the hook's. The last row is the GitHub MCP server's refused tool.
 */
export const CLAUDE_DENY_ROWS: readonly string[] = [
  "Bash(git push --force:*)",
  "Bash(git push -f:*)",
  "Bash(git push --force-with-lease:*)",
  "Bash(git push --force-if-includes:*)",
  "Bash(git push origin --force:*)",
  "Bash(git push origin -f:*)",
  "Bash(git push origin --force-with-lease:*)",
  "Bash(git push --mirror:*)",
  "Bash(git push --delete:*)",
  "Bash(git push origin --delete:*)",
  "Bash(git push -d:*)",
  "Bash(git push origin -d:*)",
  "Bash(git tag -d:*)",
  "Bash(git tag -f:*)",
  "Bash(git tag --delete:*)",
  "Bash(git tag --force:*)",
  "Bash(gh release delete:*)",
  "Bash(gh release delete-asset:*)",
  "Bash(gh secret delete:*)",
  "Bash(gh secret remove:*)",
  "Bash(gh variable delete:*)",
  "Bash(gh variable remove:*)",
  "Bash(gh repo edit --visibility:*)",
  "Bash(gh repo delete:*)",
  "Bash(gh repo transfer:*)",
  "Bash(npm unpublish:*)",
  "Bash(npm dist-tag rm:*)",
  "Bash(git push * --force*)",
  "Bash(git push * -f*)",
  "Bash(git push * --mirror*)",
  "Bash(git push * --prune*)",
  "Bash(git push * --delete*)",
  "Bash(git push * -d *)",
  "Bash(git push * +*)",
  "Bash(git tag * -f*)",
  "Bash(git tag * --force*)",
  "Bash(git tag * -d*)",
  "Bash(git tag * --delete*)",
  "Bash(gh pr merge * -d*)",
  "Bash(gh pr merge * --delete-branch*)",
  "Bash(gh pr merge -d*)",
  "Bash(gh pr merge --delete-branch*)",
  "Bash(gh release upload * --clobber*)",
  "Bash(gh release upload --clobber*)",
  "Bash(gh repo edit * --visibility*)",
  "Bash(gh repo sync * --force*)",
  "Bash(gh repo sync --force*)",
  ...GITHUB_MCP_ROWS.filter((entry) => !entry.ask).map((entry) => entry.row),
];

/**
 * The person-only rows Claude Code's settings ask for, for `permissions.ask`
 * (REQ-FLOW-102, REQ-FLOW-123): the acts that can be undone a prefix rule can say,
 * then the GitHub MCP server's ask-class tools. Each prefix is one
 * {@link personOnlyVerdict} denies with `ask: true`. A form the prefix cannot say (a
 * bare `git tag <name>`, an implied destination, a REST write) is the shell guard's
 * alone, and so is a push naming the default branch: a row ending in a branch name
 * (`git push origin main`) would also match a longer one (`main-feature`) if the
 * prefix matches as a raw string, so no row ends in a name. A settings row cannot
 * read the mode, so these rows ask in an unattended run too; the shell guard
 * refuses there first.
 */
export const CLAUDE_ASK_ROWS: readonly string[] = [
  "Bash(git push --tags:*)",
  "Bash(git push origin --tags:*)",
  "Bash(git push --follow-tags:*)",
  "Bash(git push --all:*)",
  "Bash(git tag -a:*)",
  "Bash(git tag -s:*)",
  "Bash(git tag -m:*)",
  "Bash(git tag --annotate:*)",
  "Bash(git tag --sign:*)",
  "Bash(gh pr merge:*)",
  "Bash(gh pr ready:*)",
  "Bash(gh release create:*)",
  "Bash(gh release edit:*)",
  "Bash(gh release upload:*)",
  "Bash(npm publish:*)",
  "Bash(pnpm publish:*)",
  "Bash(yarn publish:*)",
  "Bash(yarn npm publish:*)",
  "Bash(bun publish:*)",
  "Bash(gh secret set:*)",
  "Bash(gh variable set:*)",
  "Bash(gh repo edit --default-branch:*)",
  "Bash(gh repo rename:*)",
  "Bash(gh repo archive:*)",
  "Bash(gh repo unarchive:*)",
  ...GITHUB_MCP_ROWS.filter((entry) => entry.ask).map((entry) => entry.row),
];

/**
 * Whether `command` holds a person-only act (REQ-FLOW-102). The line is read as
 * a shell would split it: quotes honoured, segments split on `&&`, `||`, `;`,
 * `|`, `&`, a newline, a subshell's parentheses and a command substitution
 * (inside double quotes too), ANSI-C `$'…'` escapes decoded, redirections and
 * comments dropped, leading assignments, keywords, wrappers (`env`, `command`,
 * `sudo`, …) and package runners (`npx`, `npm exec`, `pnpm dlx`, …) skipped with
 * their options' values, a literal `sh -c`, `eval`, `env -S` or runner `-c`
 * argument, PowerShell's `-Command` or `Invoke-Expression` string, `cmd /c` or
 * `/k`'s rest, a `git rebase --exec` line and `git bisect run`'s command, read as
 * its own line (PowerShell's and `cmd`'s with a backslash as a plain character
 * and PowerShell's backtick escape, as well as a POSIX shell's), a brace attached to a word read as a PowerShell script block's
 * edge as well, and git's global options (`-c k=v` pairs among
 * them, a `remote.<name>.push` or `branch.<name>.merge` read as the refspec a
 * bare push takes) skipped before the subcommand.
 *
 * Every act is collected (v0a): each segment, each call `--next` joins, each path of a call, each flag of one gh
 * call, each field of one REST body, each mutation and `updateRefs` entry in a GraphQL text. The verdict names the
 * first refuse-class act when there is one, else the first act, and is `ask: true` only when every act is ask-class.
 *
 * `git symbolic-ref` (pr/70): a write or deletion of a name under `refs/tags/` is
 * a tag written; a write of any name but `HEAD` pointed at the default branch
 * (`refs/heads/<default>` or the bare name), or at a target the line cannot show,
 * is a push of the default branch to come, since `git push <remote> <name>` sends
 * the branch the name points at. The GraphQL repository, protection and ruleset
 * writes (pr/74) are named as GitHub's schema lists them, read on 2026-10-18 by
 * `gh api graphql -f query='{__schema{mutationType{fields{name}}}}'`: the archive,
 * `updateRepository` and its `updateRepository…` siblings, and a branch protection
 * rule's or a repository ruleset's create, update and delete. A custom property
 * written (pr/80) is one too, as GraphQL's `setRepositoryCustomPropertyValues` and
 * `create`, `delete` or `promoteRepositoryCustomProperty`, and as a REST write under
 * `repos/<o>/<r>/properties/`, `orgs/<o>/properties/` or `enterprises/<e>/properties/`:
 * an organisation ruleset can target repositories by a property, so the write can
 * take this repository out of a ruleset's protection.
 *
 * An HTTP call is read as curl or wget reads it: curl's `--next` or `-:` starts a
 * request of its own, its method and body reset, judged alone (pr/72). A call whose
 * method or targets the line cannot show throws a coded `HTTP_TARGET_HIDDEN` error
 * (in both verdicts, from the shared reading): a curl or wget configuration file,
 * in any spelling (`-K`, attached or in a cluster, `-K -`, `--config`, its `=` form
 * and prefixes, pr/73); a curl write (a write method or a body) whose target holds
 * `{` or `[`, which curl's globbing expands into other requests, unless `-g` or
 * `--globoff` is in the same request (pr/76); a wget write whose targets come from
 * `-i`/`--input-file` in any spelling, the wgetrc `input` command among them
 * (pr/77); and a curl short cluster holding `:` among other letters, which starts
 * a request where the line does not show.
 *
 * Throws a coded `NESTING_DEPTH` error for a line nested past four levels (pr/58),
 * and `HTTP_TARGET_HIDDEN` as above, each of which the guard refuses as a call it
 * cannot decide.
 *
 * Self-contained, so the emitted guard can carry it as source (see the module
 * comment).
 */
export function personOnlyVerdict(command: string, ctx: PersonOnlyContext): PersonOnlyVerdict {
  // <shell-reading>
  const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;
  const KEYWORDS = new Set(["!", "{", "}", "if", "then", "else", "elif", "fi", "do", "done", "while", "until"]);
  const WRAPPERS = new Set(["env", "command", "builtin", "exec", "nohup", "sudo", "doas", "nice", "timeout", "stdbuf", "time", "xargs",
    "npx", "bunx", "pnpx", "corepack"]);
  /**
   * Package runners spelled as a program and a subcommand; each runs its first positional word as a program, or
   * (`bun exec`, yarn's `exec`) as a shell line.
   */
  const RUNNERS = new Set(["npm exec", "npm x", "pnpm dlx", "pnpm exec", "yarn dlx", "yarn exec", "bun x", "bun exec"]);
  const RUNNER_OPTIONS: readonly [string, string[], string[]] = ["pw", ["--package", "--workspace", "--filter"], ["-c", "--call", "--shell-mode"]];
  const NO_OPTIONS: readonly [string, string[], string[]] = ["", [], []];
  /**
   * The package managers whose options can stand before a runner's subcommand (`npm -w x exec`, `pnpm --filter x exec`,
   * pr/3): those that take a value, skipped with it, and yarn's `workspace <name>`, which runs a yarn command there.
   */
  const MANAGERS = new Set(["npm", "pnpm", "yarn", "bun"]);
  const MANAGER_VALUED = new Set(["-w", "--workspace", "--filter", "-F", "--prefix", "-C", "--dir", "--cwd", "--registry", "--userconfig"]);
  /**
   * Per wrapper: the short letters and the long options that take a value (the next word when nothing is attached),
   * and the options whose value is a command line of its own (`env -S`, a runner's `-c`).
   */
  const WRAPPER_OPTIONS = new Map<string, readonly [string, string[], string[]]>([
    ["env", ["uCP", ["--unset", "--chdir"], ["-S", "--split-string"]]],
    ["sudo", ["ugpCrtUDRT", ["--user", "--group", "--prompt", "--close-from", "--role", "--type", "--other-user", "--chdir",
      "--chroot", "--command-timeout", "--host"], []]],
    ["doas", ["uC", [], []]],
    ["exec", ["a", [], []]],
    ["nice", ["n", ["--adjustment"], []]],
    ["timeout", ["sk", ["--signal", "--kill-after"], []]],
    ["stdbuf", ["ioe", ["--input", "--output", "--error"], []]],
    ["time", ["fo", ["--format", "--output"], []]],
    ["xargs", ["ILnPsdEa", ["--max-args", "--max-procs", "--max-chars", "--delimiter", "--arg-file", "--process-slot-var"], []]],
    ["npx", RUNNER_OPTIONS],
    ["bunx", RUNNER_OPTIONS],
    ["pnpx", RUNNER_OPTIONS],
  ]);
  /** The one-letter escapes of ANSI-C quoting (`$'…'`). */
  const ANSI_ESCAPES = new Map([["n", "\n"], ["t", "\t"], ["r", "\r"], ["a", "\x07"], ["b", "\b"], ["e", "\x1b"], ["E", "\x1b"],
    ["f", "\f"], ["v", "\v"], ["\\", "\\"], ["'", "'"], ['"', '"'], ["?", "?"]]);
  const SHELLS = new Set(["sh", "bash", "zsh", "dash", "ksh"]);
  /** PowerShell's two hosts and `Invoke-Expression`, each running a command string of its own (build/89). */
  const POWERSHELLS = new Set(["pwsh", "powershell", "invoke-expression", "iex"]);
  /** The quotes PowerShell opens and closes with: `'` and U+2018 to U+201B, `"` and U+201C to U+201E (v0b). */
  const PS_SINGLE = "'" + String.fromCharCode(0x2018, 0x2019, 0x201a, 0x201b);
  const PS_DOUBLE = '"' + String.fromCharCode(0x201c, 0x201d, 0x201e);

  /**
   * A program word as the shell finds it: its last path part, without case or a Windows suffix, and without a trailing
   * `@<version>`, which a runner reads as the version to run (`npx npm@10`, `corepack pnpm@9`, pr/51).
   */
  function programName(word: string): string {
    const last = word.split(/[\\/]/).pop() ?? "";
    return last.toLowerCase().replace(/^([^@]+)@[\s\S]*$/, "$1").replace(/\.(exe|cmd|bat)$/, "");
  }

  /**
   * PowerShell's `-Command` (any prefix of it, `-c` among them, or of `-CommandWithArgs`, or `-cwa`) after `-`, `--`
   * or `/`: the value attached after a `:` (`""` when none), or `null` when `word` is another word.
   */
  function commandFlag(word: string): string | null {
    const match = /^(?:--?|\/)([a-z]+)(?::([\s\S]*))?$/i.exec(word);
    const name = (match?.[1] ?? "").toLowerCase();
    return name !== "" && ("commandwithargs".startsWith(name) || name === "cwa") ? (match?.[2] ?? "") : null;
  }

  /**
   * The words of each simple command in `text`, a command substitution's text read as its own lines; with `blocks`, a
   * brace attached to a word starts or ends a PowerShell script block (`{git push}`), a brace a word opened (`@{1}`,
   * `${x}`) staying part of it; with `pwsh`, PowerShell's escape (review/194): the backtick escapes, a backslash is a
   * plain character.
   */
  function splitLine(text: string, blocks: boolean, pwsh: boolean): { segments: string[][]; nested: string[] } {
    const segments: string[][] = [];
    const nested: string[] = [];
    let words: string[] = [];
    let word = "";
    let inWord = false;
    let dropNext = false;
    const endWord = (): void => {
      if (!inWord) return;
      if (dropNext) dropNext = false;
      else words.push(word);
      word = "";
      inWord = false;
    };
    const cut = (): void => {
      endWord();
      dropNext = false;
      if (words.length > 0) segments.push(words);
      words = [];
    };
    // PowerShell's reading takes its typographic quotes as quotes too, so an act after one is read, not hidden.
    const quote = (c: string | undefined, kind: string): boolean => c !== undefined && (c === kind[0] || (pwsh && kind.includes(c)));
    let i = 0;
    while (i < text.length) {
      const ch = text[i] ?? "";
      if (quote(ch, PS_SINGLE)) {
        let stop = i + 1;
        while (stop < text.length && !quote(text[stop], PS_SINGLE)) stop += 1;
        word += text.slice(i + 1, stop);
        inWord = true;
        i = stop + 1;
      } else if (quote(ch, PS_DOUBLE)) {
        inWord = true;
        i += 1;
        while (i < text.length && !quote(text[i], PS_DOUBLE)) {
          const c = text[i] ?? "";
          const next = text[i + 1] ?? "";
          if (pwsh && c === "`" && i + 1 < text.length) {
            word += next;
            i += 2;
          } else if (!pwsh && c === "\\" && i + 1 < text.length) {
            word += '"\\$`'.includes(next) ? next : next === "\n" ? "" : c + next;
            i += 2;
          } else if ((c === "$" && next === "(") || (!pwsh && c === "`")) {
            // A substitution inside double quotes still runs: its text is read as a line of its own.
            const start = c === "`" ? i + 1 : i + 2;
            let j = start;
            if (c === "`") {
              while (j < text.length && text[j] !== "`") j += 1;
            } else {
              let level = 1;
              while (j < text.length) {
                if (text[j] === "(") level += 1;
                else if (text[j] === ")") level -= 1;
                if (level === 0) break;
                j += 1;
              }
            }
            nested.push(text.slice(start, j));
            word += text.slice(i, Math.min(j + 1, text.length));
            i = j + 1;
          } else {
            word += c;
            i += 1;
          }
        }
        i += 1;
      } else if (ch === "$" && text[i + 1] === '"') {
        // `$"…"` (locale quoting) is a double-quoted word.
        i += 1;
      } else if (ch === "$" && text[i + 1] === "'") {
        // `$'…'` (ANSI-C quoting): the word is the quoted text with its escapes decoded, so `$'\x2df'` reads `-f`.
        let j = i + 2;
        while (j < text.length && text[j] !== "'") {
          const c = text[j] ?? "";
          const next = text[j + 1] ?? "";
          const code = /^(?:x[0-9A-Fa-f]{1,2}|u[0-9A-Fa-f]{1,4}|U[0-9A-Fa-f]{1,8}|[0-7]{1,3})/.exec(text.slice(j + 1, j + 10))?.[0];
          if (c !== "\\" || j + 1 >= text.length) {
            word += c;
            j += 1;
          } else if (ANSI_ESCAPES.has(next)) {
            word += ANSI_ESCAPES.get(next) ?? "";
            j += 2;
          } else if (code !== undefined) {
            const point = /^[0-7]/.test(code) ? Number.parseInt(code, 8) : Number.parseInt(code.slice(1), 16);
            word += point <= 0x10ffff ? String.fromCodePoint(point) : "�";
            j += 1 + code.length;
          } else if (next === "c" && j + 2 < text.length) {
            word += String.fromCharCode(text.charCodeAt(j + 2) & 0x1f);
            j += 3;
          } else {
            word += c + next;
            j += 2;
          }
        }
        inWord = true;
        i = j + 1;
      } else if (ch === (pwsh ? "`" : "\\")) {
        // The escape takes the next character as it is, a line break after it joining the lines.
        const next = text[i + 1];
        const crlf = next === "\r" && text[i + 2] === "\n";
        if (next !== undefined && next !== "\n" && !(pwsh && crlf)) {
          word += next;
          inWord = true;
        }
        i += pwsh && crlf ? 3 : 2;
      } else if ((ch === "$" && text[i + 1] === "(") || ch === "`" || (ch === "(" && (inWord || words.length > 0))) {
        // An unquoted substitution, or a group inside a command (PowerShell's `(…)`), is read as its own line and stays
        // a word, so the words after it are still this command's (pr/89). A group opening a command is cut below.
        const start = ch === "$" ? i + 2 : i + 1;
        let j = start;
        if (ch === "`") {
          while (j < text.length && text[j] !== "`") j += 1;
        } else {
          let level = 1;
          while (j < text.length) {
            if (text[j] === "(") level += 1;
            else if (text[j] === ")") level -= 1;
            if (level === 0) break;
            j += 1;
          }
        }
        nested.push(text.slice(start, j));
        word += text.slice(i, Math.min(j + 1, text.length));
        inWord = true;
        i = j + 1;
      } else if (ch === " " || ch === "\t") {
        endWord();
        i += 1;
      } else if (ch === "#" && !inWord) {
        while (i < text.length && text[i] !== "\n") i += 1;
      } else if (ch === ">" || ch === "<") {
        // A redirection: a file-descriptor number before it and its target after it are not arguments.
        if (inWord && /^\d+$/.test(word)) {
          word = "";
          inWord = false;
        } else endWord();
        while (i < text.length && "<>&|".includes(text[i] ?? "")) i += 1;
        dropNext = true;
      } else if (
        ";&|\n\r()`".includes(ch) ||
        (blocks && ch === "{" && !inWord) ||
        (blocks && ch === "}" && word.split("{").length <= word.split("}").length)
      ) {
        cut();
        i += 1;
      } else {
        word += ch;
        inWord = true;
        i += 1;
      }
    }
    cut();
    return { segments, nested };
  }

  /** Each assignment word the reading below skips (`X=v git …`, `env X=v …`), as it decoded it (review/208). */
  const assigned: string[] = [];

  /**
   * Each simple command's words, its program word first and normalized; `sh -c` and `eval` text read too. With `pwsh`,
   * the text is PowerShell's: a PowerShell command string or the Windows command interpreter's rest, whose backslash is
   * a plain character (review/194). A line nested past four levels throws a coded `NESTING_DEPTH` error (pr/58): the
   * reading stops there, so the guard refuses the line rather than allow what the fifth level runs.
   */
  function commandsOf(text: string, depth: number, pwsh: boolean): string[][] {
    if (depth > 4) throw Object.assign(new Error("nesting"), { code: "NESTING_DEPTH" });
    const { segments, nested } = splitLine(text, true, pwsh);
    // A PowerShell line is read with a POSIX shell's escapes too, and a line with a brace with its braces as words too
    // (review/185), so either reading adds denials and never lifts one: `git push origin x} -f` still forces.
    const commands: string[][] = pwsh ? commandsOf(text, depth, false) : [];
    for (const words of [...segments, ...(/[{}]/.test(text) ? splitLine(text, false, pwsh).segments : [])]) {
      let k = 0;
      let line: string | null = null;
      while (k < words.length && line === null) {
        const word = words[k] ?? "";
        let sub = k + 1;
        while (MANAGERS.has(programName(word)) && sub < words.length) {
          const option = words[sub] ?? "";
          const next = words[sub + 1] ?? "-";
          if (MANAGER_VALUED.has(option) || (programName(word) === "yarn" && option === "workspace")) sub += 2;
          // npm reads any `--<key> <value>` as a setting (`--loglevel silly`): a long option's next word is its value
          // unless it is an option or a runner's subcommand.
          else if (/^--[^=]+$/.test(option) && !next.startsWith("-") && !RUNNERS.has(`${programName(word)} ${next}`)) sub += 2;
          else if (option.startsWith("-") && option !== "--") sub += 1;
          else break;
        }
        const runner = `${programName(word)} ${words[sub] ?? ""}`;
        if (ASSIGNMENT.test(word) || KEYWORDS.has(word)) {
          if (ASSIGNMENT.test(word)) assigned.push(word);
          k += 1;
        } else if (WRAPPERS.has(programName(word)) || RUNNERS.has(runner)) {
          // A wrapper's options are skipped with their values, so `sudo -u root git …` reads `git` as the program.
          const [short, long, lineOptions] = RUNNERS.has(runner)
            ? RUNNER_OPTIONS
            : (WRAPPER_OPTIONS.get(programName(word)) ?? NO_OPTIONS);
          k = RUNNERS.has(runner) ? sub + 1 : k + 1;
          while (k < words.length) {
            const option = words[k] ?? "";
            if (ASSIGNMENT.test(option)) {
              assigned.push(option);
              k += 1;
              continue;
            }
            if (!/^(-|\d)/.test(option)) break;
            k += 1;
            if (option === "--") break;
            let value: string | undefined;
            let isLine = false;
            if (option.startsWith("--")) {
              const name = option.split("=")[0] ?? "";
              if (long.includes(name) || lineOptions.includes(name)) {
                isLine = lineOptions.includes(name);
                value = option.includes("=") ? option.slice(name.length + 1) : words[k];
                if (!option.includes("=")) k += 1;
              }
            } else if (option.startsWith("-")) {
              for (let c = 1; c < option.length; c += 1) {
                const letter = option[c] ?? "";
                if (!short.includes(letter) && !lineOptions.includes(`-${letter}`)) continue;
                isLine = lineOptions.includes(`-${letter}`);
                value = c === option.length - 1 ? words[k] : option.slice(c + 1);
                if (c === option.length - 1) k += 1;
                break;
              }
            }
            // An option whose value is a command line (`env -S '…'`, `npx -c '…'`): that line is what runs.
            if (isLine && value !== undefined) {
              line = [value, ...words.slice(k)].join(" ");
              break;
            }
          }
        } else break;
      }
      if (line !== null) {
        commands.push(...commandsOf(line, depth + 1, pwsh));
        continue;
      }
      const cmd = words.slice(k);
      if (cmd.length === 0) continue;
      // A program word holding a whole command line (`bun exec 'git push'`) is also read as that line, unless it is this one.
      if (/\s/.test(cmd[0] ?? "") && cmd.join(" ") !== text) commands.push(...commandsOf(cmd.join(" "), depth + 1, pwsh));
      cmd[0] = programName(cmd[0] ?? "");
      // git's dashed form (`git-push`, as git's exec path holds it) is git running that subcommand.
      if (/^git-./.test(cmd[0])) cmd.splice(0, 1, "git", cmd[0].slice(4));
      if (SHELLS.has(cmd[0] ?? "")) {
        const flag = cmd.findIndex((word, index) => index > 0 && /^-[A-Za-z]*c[A-Za-z]*$/.test(word));
        const script = flag === -1 ? undefined : cmd[flag + 1];
        if (script !== undefined) commands.push(...commandsOf(script, depth + 1, false));
      } else if (cmd[0] === "eval") {
        commands.push(...commandsOf(cmd.slice(1).join(" "), depth + 1, false));
      } else if (POWERSHELLS.has(cmd[0] ?? "")) {
        // PowerShell's command string (build/89): the words after `-Command`; with none, the words from the first one
        // that is no option, and each later word holding a blank, a quoted command past an option's value, each read
        // with PowerShell's escape (review/194).
        const at = cmd.findIndex((word, index) => index > 0 && commandFlag(word) !== null);
        const first = at !== -1 ? -1 : cmd.findIndex((word, index) => index > 0 && !/^-|^\/\w*$/.test(word));
        if (at !== -1) commands.push(...commandsOf([commandFlag(cmd[at] ?? ""), ...cmd.slice(at + 1)].join(" "), depth + 1, true));
        else if (first !== -1) commands.push(...commandsOf(cmd.slice(first).join(" "), depth + 1, true));
        for (const word of first === -1 ? [] : cmd.slice(first + 1)) if (/\s/.test(word)) commands.push(...commandsOf(word, depth + 1, true));
      } else if (cmd[0] === "cmd") {
        // The Windows command interpreter (review/183): the words after `/c` or `/k`, any letter case, a value attached,
        // read as PowerShell's are, a backslash being a plain character there too (review/194), and read with each
        // caret escape taken off as well (`g^it`, `--for^ce`, pr/10), so that reading only adds denials.
        const at = cmd.findIndex((word, index) => index > 0 && /^\/[ck]/i.test(word));
        const rest = at === -1 ? "" : [(cmd[at] ?? "").slice(2), ...cmd.slice(at + 1)].join(" ");
        if (at !== -1) commands.push(...commandsOf(rest, depth + 1, true));
        if (rest.includes("^")) commands.push(...commandsOf(rest.replace(/\^([\s\S])/g, "$1"), depth + 1, true));
      } else if (cmd[0] === "git") {
        // Lines a git builtin runs (review/184): each `git rebase --exec` or `-x` line (`--ex`, `--exe` and a cluster
        // as git's option parser reads them), and the command `git bisect run` runs, its words kept as words.
        const { sub, args } = gitParts(cmd);
        const rebase = sub === "rebase" ? args : [];
        for (let j = 0; j < rebase.length && rebase[j] !== "--"; j += 1) {
          const arg = rebase[j] ?? "";
          const long = /^--ex(?:ec?)?(=[\s\S]*)?$/.exec(arg);
          let exec: string | undefined;
          if (long !== null) exec = long[1] === undefined ? rebase[(j += 1)] : long[1].slice(1);
          else if (/^-[^-]/.test(arg)) {
            for (let c = 1; c < arg.length; c += 1) {
              const letter = arg[c] ?? "";
              if (letter === "x") exec = c === arg.length - 1 ? rebase[(j += 1)] : arg.slice(c + 1);
              if (letter === "x" || "sXCS".includes(letter)) {
                if (letter !== "x" && letter !== "S" && c === arg.length - 1) j += 1;
                break;
              }
            }
          }
          if (exec !== undefined) commands.push(...commandsOf(exec, depth + 1, false));
        }
        if (sub === "bisect" && args[0] === "run") {
          commands.push(...commandsOf(args.slice(1).map((word) => `'${word.replace(/'/g, "'\\''")}'`).join(" "), depth + 1, false));
        }
      }
      commands.push(cmd);
    }
    for (const inner of nested) commands.push(...commandsOf(inner, depth + 1, pwsh));
    return commands;
  }

  /** git's subcommand, its arguments and its `-c` pairs, the global options skipped. */
  function gitParts(cmd: string[]): { sub: string; args: string[]; config: string[] } {
    const config: string[] = [];
    let k = 1;
    while (k < cmd.length) {
      const word = cmd[k] ?? "";
      if (word === "-c") {
        config.push(cmd[k + 1] ?? "");
        k += 2;
      } else if (["-C", "--git-dir", "--work-tree", "--namespace", "--config-env", "--super-prefix"].includes(word)) {
        k += 2;
      } else if (word.startsWith("-")) {
        k += 1;
      } else break;
    }
    return { sub: (cmd[k] ?? "").toLowerCase(), args: cmd.slice(k + 1), config };
  }

  /**
   * gh's positional words, `-R`/`--repo` and its value skipped. Before the subcommand, as gh's parser reads it (pr/97),
   * an option with no `=` but help and version takes the next word: `gh pr --body x merge 1` merges.
   */
  function ghPositionals(cmd: string[]): string[] {
    const positionals: string[] = [];
    for (let k = 1; k < cmd.length; k += 1) {
      const word = cmd[k] ?? "";
      if (word === "-R" || word === "--repo") k += 1;
      else if (positionals.length < 2 && /^(?:--[^=]+|-[^-])$/.test(word) && !["-h", "--help", "--version"].includes(word)) k += 1;
      else if (!word.startsWith("-")) positionals.push(word);
    }
    return positionals;
  }

  /**
   * An HTTP call's method (the tool's default unless a flag or a body sets it), whether that is a write, and each
   * target's path below its repository or organisation (`repos/<o>/<r>/` cut), without scheme, host, query or a
   * trailing slash and with its percent-encoding decoded (build/76), read a second time with its dot segments resolved
   * (pr/93); the repository's own path stays whole. `next` is
   * the call after curl's `--next` (pr/72).
   */
  function httpCall(raw: string[]): { write: boolean; method: string; paths: string[]; cmd: string[]; next: string[] | null } {
    const tool = raw[0] ?? "";
    const hidden = (): never => {
      throw Object.assign(new Error("http target hidden"), { code: "HTTP_TARGET_HIDDEN" });
    };
    // wget reads a long option's unique prefix as the option (`--meth=DELETE`, `--post-d`, pr/11), and curl's 7.x line
    // does too (`--req DELETE`, `--dat '{}'`, pr/84): one of two letters or more (`--me`, pr/29) is expanded to the
    // method, body, `--execute`, `--config`, `--input-file`, `--next`, `--globoff` or `--url` option it begins, a full
    // name kept as it is, so a misread prefix only adds a denial. A prefix the tool finds ambiguous (wget's `--po`,
    // curl's `--dat`) is one it refuses, so reading it as the option over-reads a line that sends nothing into a denial.
    const LONG = new Map([
      ["wget", ["--method", "--post-data", "--post-file", "--body-data", "--body-file", "--execute", "--config", "--input-file"]],
      ["curl", ["--request", "--data", "--data-raw", "--data-binary", "--data-ascii", "--data-urlencode", "--json", "--form",
        "--form-string", "--upload-file", "--config", "--next", "--globoff", "--url"]],
    ]);
    const expanded = raw.map((word) => {
      const name = word.split("=")[0] ?? "";
      const full = /^--[a-z-]{2,}$/i.test(name) ? LONG.get(tool)?.find((option) => option.startsWith(name.toLowerCase())) : undefined;
      return full === undefined ? word : full + word.slice(name.length);
    });
    // wget runs `-e`/`--execute`'s value as a wgetrc command (pr/23), its name read regardless of case, `_` and `-`:
    // `method=<M>`, the four body commands and `input` become the option each sets, so the call is read as that option's.
    // Any other command stays a skipped value. A cluster ending in `e`, or with a command attached after its `e`, counts.
    const WGETRC = new Map([["method", "--method"], ["postdata", "--post-data"], ["postfile", "--post-file"],
      ["bodydata", "--body-data"], ["bodyfile", "--body-file"], ["input", "--input-file"]]);
    const cmd: string[] = [];
    for (let k = 0; k < expanded.length; k += 1) {
      const word = expanded[k] ?? "";
      // curl's body or method letter with its value attached, or a short cluster's first value letter (`-d@<file>`,
      // `-sd{…}`, `-sT f`, pr/81; `-sX$M`, pr/83), and gh's value letter after its one boolean, `-i`, its `=` aside as
      // gh reads it (`-iXDELETE`, `-X=PUT`), read apart: the letters before it, the letter, its value. A cluster whose
      // first value letter is another is read as no method and no body, the letters after it being its value (`-oX`,
      // `-od`), and wget has no short method or body letter.
      const lead =
        tool === "curl" ? /^-([^-:KHouAebcwmxrEdFTXCDPQtyYzU]*)([dFTX])([\s\S]*)$/.exec(word)
        : tool === "gh" ? /^-(i*)([XfFHpqt])=?([\s\S]*)$/.exec(word)
        : null;
      if (lead !== null && word.length > 2) {
        if (lead[1]) cmd.push(`-${lead[1]}`);
        cmd.push(`-${lead[2]}`);
        if (lead[3]) cmd.push(lead[3]);
        continue;
      }
      const own = /^(-[A-Za-z]*e|--execute)$/.test(word);
      let rc: string | undefined;
      if (tool === "wget" && k > 0) {
        if (own) rc = expanded[k + 1];
        else if (word.startsWith("--execute=")) rc = word.slice(10);
        else rc = /^-[A-Za-z]*?e(.+)$/.exec(word)?.[1];
      }
      const eq = rc?.indexOf("=") ?? -1;
      const option = rc !== undefined && eq > 0 ? WGETRC.get(rc.slice(0, eq).trim().toLowerCase().replace(/[-_]/g, "")) : undefined;
      if (rc === undefined || option === undefined) cmd.push(word);
      else {
        cmd.push(`${option}=${rc.slice(eq + 1).trim()}`);
        if (own) k += 1;
      }
    }
    let method: string | null = null;
    let body = false;
    let globoff = false;
    let inputFile = false;
    let end = cmd.length;
    let next: string[] | null = null;
    const targets: string[] = [];
    // gh's options before `api` are the call's too (pr/97).
    const api = tool === "gh" ? cmd.indexOf("api") : -1;
    const valueFlags =
      tool === "gh"
        ? ["-H", "--header", "-q", "--jq", "-t", "--template", "--hostname", "-p", "--preview", "--cache"]
        : ["-H", "--header", "-o", "--output", "-u", "--user", "-A", "--user-agent", "-e", "--referer", "-b", "--cookie",
           "-c", "--cookie-jar", "-w", "--write-out", "-m", "--max-time", "-x", "--proxy", "-K", "--config", "-r",
           "--range", "-E", "--cert", "--key", "--cacert", "--oauth2-bearer", "--connect-timeout", "--retry",
           "-O", "--output-document", "--password"];
    const bodyFlags =
      tool === "gh"
        ? ["-f", "-F", "--field", "--raw-field", "--input"]
        : ["-d", "--data", "--data-raw", "--data-binary", "--data-urlencode", "--data-ascii", "--json", "-F", "--form",
           "--form-string", "-T", "--upload-file", "--post-data", "--post-file", "--body-data", "--body-file"];
    for (let k = 1; k < cmd.length; k += 1) {
      if (k === api) continue;
      const word = cmd[k] ?? "";
      const name = word.split("=")[0] ?? "";
      if (tool === "curl" && (word === "--next" || word === "-:")) {
        next = ["curl", ...cmd.slice(k + 1)];
        end = k;
        break;
      }
      if (tool !== "gh" && /^--conf(ig?)?(=|$)/.test(word)) hidden();
      if (tool === "wget" && /^--input-file(=|$)/.test(word)) inputFile = true;
      if (tool !== "gh" && /^-[^-]/.test(word)) {
        // A cluster's letters up to the first that takes a value.
        for (const letter of word.slice(1)) {
          if (tool === "curl") {
            if (letter === "K" || letter === ":") hidden();
            if (letter === "g") globoff = true;
            if ("HouAebcwmxrEdFTXCDPQtyYzU".includes(letter)) break;
          } else {
            if (letter === "i") inputFile = true;
            if ("oaeiBtOTwQPlARDXIU".includes(letter)) break;
          }
        }
      }
      if (tool === "curl" && word === "--globoff") globoff = true;
      // wget's `-X` is `--exclude-directories` (pr/90).
      const methodLetter = tool !== "wget";
      if ((word === "-X" && methodLetter) || word === "--method" || word === "--request") {
        // A method word the line ends before is one it cannot show (pr/83).
        method = cmd[k + 1] ?? hidden();
        k += 1;
      } else if (name === "--method" || name === "--request") {
        method = word.slice(name.length + 1);
      } else if (/^-X./.test(word) && methodLetter) {
        method = word.slice(2);
      } else if (word === "-X") {
        k += 1;
      } else if (bodyFlags.includes(word)) {
        body = true;
        k += 1;
      } else if (word.includes("=") && bodyFlags.includes(name)) {
        body = true;
      } else if (word === "--url") {
        targets.push(cmd[k + 1] ?? "");
        k += 1;
      } else if (valueFlags.includes(word)) {
        k += 1;
      } else if (/^-[fF]./.test(word) && tool === "gh") {
        body = true;
      } else if (!word.startsWith("-")) {
        targets.push(word);
      }
    }
    const verb = (method ?? (body ? "POST" : "GET")).toUpperCase();
    const write = ["POST", "PUT", "PATCH", "DELETE"].includes(verb);
    // A method the line cannot show (pr/83), a target curl's globbing expands (pr/76), targets in wget's input file (pr/77).
    if (method !== null && /[$`]/.test(method)) hidden();
    if (tool === "curl" && (write || body) && !globoff && targets.some((target) => /[{[]/.test(target))) hidden();
    if (tool === "wget" && write && inputFile) hidden();
    // Each target read twice (pr/93): as written, and with its dot segments resolved (RFC 3986 §5.2.4), as curl sends
    // it unless `--path-as-is` is set, `api/v3/` cut again from the resolved one. A rule matching either denies, so the
    // second reading only adds denials, whatever the tool does with the segments.
    const resolved = (path: string): string => {
      const segments = path.split("/");
      const kept: string[] = [];
      segments.forEach((segment, index) => {
        if (segment === "..") kept.pop();
        else if (segment !== ".") kept.push(segment);
        if ((segment === "." || segment === "..") && index === segments.length - 1) kept.push("");
      });
      return kept.join("/").replace(/^\/+/, "").replace(/^api\/v3\//i, "");
    };
    const paths = targets.flatMap((target) => {
      const decoded = (target
        .replace(/^[A-Za-z][A-Za-z0-9+.-]*:\/\/[^/]*/, "")
        .replace(/^[\w-]+(\.[\w-]+)+(:\d+)?(?=\/)/, "")
        .replace(/^\/+/, "")
        .replace(/^api\/v3\//i, "")
        .split(/[?#]/)[0] ?? "")
        .replace(/%([0-9A-Fa-f]{2})/g, (_, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)));
      return [...new Set([decoded, resolved(decoded)])].map((path) =>
        path
          // A trailing slash dropped first, so the bare repository path stays `repos/<o>/<r>` (or `repositories/<id>`).
          .replace(/\/+$/, "")
          .replace(/^repos\/[^/]+\/[^/]+\//i, "")
          .replace(/^(orgs|enterprises|users|repositories)\/[^/]+\//i, ""),
      );
    });
    return { write, method: verb, paths, cmd: cmd.slice(0, end), next };
  }
  // </shell-reading>

  const branch = (ref: string): string =>
    ref.replace(/^refs\/heads\//i, "").replace(/^refs\/remotes\/[^/]+\//i, "").toLowerCase();
  const defaults = new Set(["main", "master", ...ctx.defaultBranches.map(branch)]);
  const onDefault = ctx.currentBranch !== null && defaults.has(branch(ctx.currentBranch));
  // The local tags are read the first time a push refspec's side asks (review/218), so the guard, which reads them
  // from disk on access, reads none for any other call.
  let tagNames: Set<string> | null = null;
  const isTagName = (name: string): boolean =>
    (tagNames ??= new Set(ctx.tags.map((tag) => tag.replace(/^refs\/tags\//i, "").toLowerCase()))).has(name);
  // The ask-class rules (REQ-FLOW-102): any other rule refuses (REQ-FLOW-124), so a rule missing here never asks.
  const ASK_RULES = new Set(["push-default", "push-tags", "tag", "pr-merge", "pr-ready", "release", "publish", "secrets", "protection"]);
  // Every act the line holds (v0a): each segment, each call `--next` joins, each path, flag, body field and GraphQL
  // entry; a refuse-class one decides the verdict, so a deletion never rides an approval.
  const acts: { deny: true; rule: PersonOnlyRuleId; act: string; reason: string; ask: boolean }[] = [];
  const deny = (rule: PersonOnlyRuleId, what: string): PersonOnlyVerdict => {
    const verdict = {
      deny: true as const,
      rule,
      act: what,
      reason:
        `${what} is a person-only act (${rule}): the person runs it, never the agent (REQ-FLOW-102). ` +
        `Stop here and list it for the person.`,
      ask: ASK_RULES.has(rule),
    };
    acts.push(verdict);
    return verdict;
  };

  /** A refspec's destination as a branch name: `+` dropped, `<src>:` cut, `refs/heads/` or `heads/` cut. */
  function destination(refspec: string): string {
    const spec = refspec.replace(/^\+/, "");
    const colon = spec.indexOf(":");
    if (colon === -1) return spec;
    const dst = spec.slice(colon + 1);
    return dst === "" ? spec.slice(0, colon) : dst;
  }

  function pushVerdict(args: string[], config: string[]): PersonOnlyVerdict | null {
    let force = false;
    let remove = false;
    let tags = false;
    let matching = false;
    let repoGiven = false;
    const positionals: string[] = [];
    // Refspecs a `-c` pair on the line supplies when the line names none: `remote.<name>.push`, and the upstream
    // a `branch.<name>.merge` names (where `push.default=upstream` sends a refspec-less push). Read whatever
    // remote or branch the pair names, so they add denials and never lift one.
    const configured: string[] = [];
    for (const pair of config) {
      const eq = pair.indexOf("=");
      const key = (eq === -1 ? pair : pair.slice(0, eq)).toLowerCase();
      const value = eq === -1 ? "true" : pair.slice(eq + 1).toLowerCase();
      const on = !["false", "no", "off", "0", ""].includes(value);
      if (key === "push.followtags" && on) tags = true;
      if (/^remote\..+\.mirror$/.test(key) && on) force = true;
      if (key === "push.default" && value === "matching") matching = true;
      if (/^remote\..+\.push$/.test(key) && eq !== -1) configured.push(pair.slice(eq + 1));
      if (/^branch\..+\.merge$/.test(key) && eq !== -1) configured.push(`HEAD:${pair.slice(eq + 1)}`);
    }
    for (let j = 0; j < args.length; j += 1) {
      const arg = args[j] ?? "";
      if (arg === "--") {
        positionals.push(...args.slice(j + 1));
        break;
      }
      if (arg.startsWith("--")) {
        const name = (arg.split("=")[0] ?? "").toLowerCase();
        // git reads an option's unique prefix as the option (`--force-w`, `--del`, `--rep=`, pr/9): a
        // name is read as each option it begins. A prefix of two options is one git refuses, so reading it as either
        // adds a denial to a line that pushes nothing, and a `--no-` form begins none of these.
        const is = (options: string[]): boolean => name.length > 2 && options.some((option) => option.startsWith(name));
        // `--mirror` also force-updates and deletes remote refs, so it reads as a force push (v0a).
        if (is(["--force", "--force-with-lease", "--force-if-includes", "--mirror"])) force = true;
        else if (is(["--tags", "--follow-tags", "--all", "--branches"])) tags = true;
        else if (is(["--delete", "--prune"])) remove = true;
        else if (is(["--repo"])) {
          repoGiven = true;
          if (!arg.includes("=")) j += 1;
        } else if (is(["--push-option", "--receive-pack", "--exec"]) && !arg.includes("=")) j += 1;
      } else if (arg.startsWith("-") && arg.length > 1) {
        for (let c = 1; c < arg.length; c += 1) {
          const flag = arg[c];
          if (flag === "f") force = true;
          else if (flag === "d") remove = true;
          else if (flag === "o") {
            if (c === arg.length - 1) j += 1;
            break;
          }
        }
      } else positionals.push(arg);
    }
    const named = repoGiven ? positionals : positionals.slice(1);
    // git reads `tag <name>` as `refs/tags/<name>:refs/tags/<name>`, whatever the context lists.
    const tagWord = named.indexOf("tag");
    const tagNamed = tagWord !== -1 && tagWord < named.length - 1;
    const refspecs = named.length > 0 ? named : configured;
    // A side naming a tag (`refs/tags/…`, `tags/…`, or a bare local tag name) pushes one: git gives a bare
    // destination the source's `refs/tags/` namespace, so `v1:x` and `refs/tags/v1:x` create the remote tag `x`.
    const namesTag = (side: string): boolean =>
      side !== "" && (/^(refs\/)?tags\//i.test(side) || isTagName(side.toLowerCase()));
    // Force and deletion are read before the `tag` word (v0a): both are refuse-class, the tag push ask-class.
    // A reason names the act and a branch at most, never the arguments: a remote URL can carry a credential.
    if (force || refspecs.some((spec) => spec.startsWith("+"))) return deny("force-push", "A force push");
    const deleted = refspecs.filter((spec) => spec.length > 1 && spec.startsWith(":")).map((spec) => spec.slice(1));
    if (remove || deleted.length > 0) {
      if (tagNamed || [...deleted, ...(remove ? refspecs : [])].some(namesTag)) return deny("tag-delete", "A remote tag deletion");
      return deny("push-delete", "A remote branch deletion");
    }
    if (tagNamed) return deny("push-tags", "A push of tags");
    const sides = (spec: string): string[] => {
      const bare = spec.replace(/^\+/, "");
      const colon = bare.indexOf(":");
      return colon === -1 ? [bare] : [bare.slice(0, colon), bare.slice(colon + 1)];
    };
    if (tags || refspecs.some((spec) => sides(spec).some(namesTag))) return deny("push-tags", "A push of tags");
    for (const spec of refspecs) {
      const name = destination(spec).replace(/^(refs\/)?heads\//i, "").toLowerCase();
      if (spec === ":" || spec === "+:") return deny("push-default", "A matching push, the default branch among them");
      if (defaults.has(name)) return deny("push-default", `A push to the default branch \`${name}\``);
      if ((name === "head" || name === "@") && onDefault) {
        return deny("push-default", "A push of `HEAD` while on the default branch");
      }
      // A pattern refspec (`refs/heads/*:refs/heads/*`) pushes every branch it matches: denied when a default
      // branch, by short name or full ref, is among them.
      const pattern = destination(spec).toLowerCase();
      if (pattern.includes("*")) {
        const parts = pattern.split("*").map((part) => part.replace(/[.+?^$()|[\]{}\\]/g, "\\$&"));
        const glob = new RegExp(`^${parts.join(".*")}$`);
        if ([...defaults].some((ref) => [ref, `heads/${ref}`, `refs/heads/${ref}`].some((full) => glob.test(full)))) {
          return deny("push-default", "A pattern push, the default branch among the branches it matches");
        }
      }
    }
    // Keyed on the line's own refspecs: a `-c` pair only adds denials, since git applies it only to its own remote
    // or branch, which the line does not show (review/98).
    if (named.length === 0 && (onDefault || matching)) {
      return deny("push-default", "A push with no refspec that lands on the default branch");
    }
    return null;
  }

  function tagVerdict(args: string[]): PersonOnlyVerdict | null {
    const write = new Set(["--annotate", "--sign", "--local-user", "--force", "--delete", "--message", "--file", "--edit",
      "--verify", "--create-reflog", "--cleanup", "--trailer"]);
    const valued = new Set(["--contains", "--no-contains", "--merged", "--no-merged", "--points-at", "--sort", "--format"]);
    const listing = new Set(["--list", "--contains", "--no-contains", "--merged", "--no-merged", "--points-at"]);
    let list = false;
    let written = false;
    // A deletion or a forced move (`-d`, `-f`, `--delete`, `--force` and git's unique prefixes of the two) is
    // refuse-class (v0a); any other write is a tag created. A write option's value is skipped, so a message reading
    // `-d` is no flag.
    let removed = false;
    const positionals: string[] = [];
    for (let j = 0; j < args.length; j += 1) {
      const arg = args[j] ?? "";
      if (arg === "--") {
        positionals.push(...args.slice(j + 1));
        break;
      }
      if (arg.startsWith("--")) {
        const name = arg.split("=")[0] ?? "";
        if (name.length > 2 && ["--delete", "--force"].some((option) => option.startsWith(name))) removed = true;
        else if (write.has(name)) written = true;
        if (listing.has(name)) list = true;
        if ((valued.has(name) || ["--local-user", "--message", "--file", "--cleanup", "--trailer"].includes(name)) && !arg.includes("=")) j += 1;
      } else if (arg.startsWith("-") && arg.length > 1) {
        // `-n<num>` lists; any of a s u f d m F e v in a short cluster writes or verifies, `u`, `m` and `F` taking
        // the rest of the cluster or the next word as their value.
        for (let c = 1; c < arg.length; c += 1) {
          const letter = arg[c] ?? "";
          if (letter === "d" || letter === "f") removed = true;
          else if ("asmFuev".includes(letter)) written = true;
          if (letter === "l" || letter === "n") list = true;
          if ("umFn".includes(letter)) {
            if (c === arg.length - 1 && letter !== "n") j += 1;
            break;
          }
        }
      } else positionals.push(arg);
    }
    if (removed) return deny("tag-delete", "A tag deleted or moved (`git tag -d` or `-f`)");
    if (written) return deny("tag", "A tag write (`git tag`)");
    return list || positionals.length === 0 ? null : deny("tag", "A tag created (`git tag <name>`)");
  }

  /** `git symbolic-ref`'s writes (pr/70), and `git update-ref --stdin`'s symref commands read as its arguments (pr/82). */
  function symbolicRefVerdict(args: string[], via = "git symbolic-ref"): PersonOnlyVerdict | null {
    let remove = false;
    const positionals: string[] = [];
    for (let j = 0; j < args.length; j += 1) {
      const arg = args[j] ?? "";
      if (arg === "--") {
        positionals.push(...args.slice(j + 1));
        break;
      }
      if (arg.startsWith("--")) {
        const name = (arg.split("=")[0] ?? "").toLowerCase();
        if (name.length > 2 && "--delete".startsWith(name)) remove = true;
      } else if (arg.startsWith("-") && arg.length > 1) {
        for (let c = 1; c < arg.length; c += 1) {
          if (arg[c] === "d") remove = true;
          else if (arg[c] === "m") {
            if (c === arg.length - 1) j += 1;
            break;
          }
        }
      } else positionals.push(arg);
    }
    const [name = "", target] = positionals;
    if (remove && /^(refs\/)?tags\//i.test(name)) return deny("tag-delete", `A symbolic tag ref deleted (\`${via}\`)`);
    if (target !== undefined && /^(refs\/)?tags\//i.test(name)) {
      return deny("tag", `A symbolic tag ref written or deleted (\`${via}\`)`);
    }
    if (remove || target === undefined || name === "HEAD") return null;
    if (/[$`]/.test(target) || defaults.has(target.replace(/^(refs\/)?heads\//i, "").toLowerCase())) {
      return deny("push-default", `A symbolic ref pointed at the default branch, or at a branch the line cannot show (\`${via}\`)`);
    }
    return null;
  }

  /** Every act of one gh call (v0a): each flag is read, the refuse-class ones before the call's ask-class act. */
  function ghVerdict(cmd: string[]): void {
    const [group, sub] = ghPositionals(cmd);
    /**
     * Whether the call sets gh's boolean flag `long` (`--x`, or `--x=<value>` other than a false spelling) or its
     * letter `short`, alone or in a cluster before a letter in `valued`, whose value the rest of the cluster is.
     */
    const flag = (long: string, short: string, valued: string): boolean =>
      cmd.some((word) => {
        if (word === long || word.startsWith(`${long}=`)) return !/^(?:false|f|0)$/i.test(word.slice(long.length + 1));
        if (!/^-[^-]/.test(word)) return false;
        for (const letter of word.slice(1)) {
          if (letter === short) return true;
          if (valued.includes(letter)) return false;
        }
        return false;
      });
    // Merging with `-d`/`--delete-branch` deletes the head branch on the remote, as closing with it does (v0a).
    if (group === "pr" && sub === "merge" && flag("--delete-branch", "d", "bFtA")) {
      deny("push-delete", "A remote branch deletion (`gh pr merge --delete-branch`)");
    }
    if (group === "pr" && sub === "merge") deny("pr-merge", "Merging a pull request (`gh pr merge`)");
    // Closing with `--delete-branch` deletes the pull request's head branch on the remote (review/207).
    if (group === "pr" && sub === "close" && flag("--delete-branch", "d", "c")) {
      deny("push-delete", "A remote branch deletion (`gh pr close --delete-branch`)");
    }
    // An approval counts toward a required review, as a merge's own gate (review/210).
    if (group === "pr" && sub === "review" && flag("--approve", "a", "bF")) {
      deny("pr-merge", "Approving a pull request review (`gh pr review --approve`)");
    }
    if (group === "pr" && sub === "ready") deny("pr-ready", "Marking a pull request ready (`gh pr ready`)");
    if (group === "release" && sub !== undefined && !["list", "ls", "view", "download"].includes(sub)) {
      // `upload --clobber` replaces an asset, which removes the one it replaces.
      if (sub === "delete" || sub === "delete-asset" || (sub === "upload" && flag("--clobber", "", ""))) {
        deny("release-delete", `A release or asset deletion (\`gh release ${sub}\`)`);
      } else deny("release", "A release write (`gh release`)");
    }
    // `list` and a variable's `get` are reads (build/9).
    if ((group === "secret" || group === "variable") && sub !== undefined && !["list", "ls", ...(group === "variable" ? ["get"] : [])].includes(sub)) {
      if (sub === "delete" || sub === "remove") deny("secrets-delete", `A ${group} deletion (\`gh ${group} ${sub}\`)`);
      else deny("secrets", `A ${group} write (\`gh ${group}\`)`);
    }
    if (group === "repo" && sub === "delete") deny("repo-delete", "A repository delete (`gh repo delete`)");
    // A transfer back needs the new owner, so it is one the agent cannot undo (v0a).
    if (group === "repo" && sub === "transfer") deny("repo-irreversible", "A repository transfer (`gh repo transfer`)");
    // Unarchiving makes the repository take writes again, as the GraphQL and REST twins do (pr/96); archiving undoes it.
    if (group === "repo" && ["archive", "unarchive", "rename"].includes(sub ?? "")) {
      deny("protection", `A repository ${sub} (\`gh repo ${sub}\`)`);
    }
    // `gh repo sync` with a destination repository updates that repository's branch, the default one unless
    // `--branch` names another, a fast-forward or under `--force` a hard reset (pr/94): the twins of the REST
    // `merge-upstream` and forced ref update. With none it syncs the local checkout, which writes nothing remote.
    // The hard reset is refuse-class, the fast-forward ask-class (v0a).
    if (group === "repo" && sub === "sync") {
      const words: string[] = [];
      const branches: string[] = [];
      for (let k = 1; k < cmd.length; k += 1) {
        const word = cmd[k] ?? "";
        if (word === "-b" || word === "--branch") branches.push(cmd[(k += 1)] ?? "");
        else if (word.startsWith("--branch=")) branches.push(word.slice(9));
        else if (/^-b./.test(word)) branches.push(word.slice(2).replace(/^=/, ""));
        else if (["-R", "--repo", "-s", "--source"].includes(word)) k += 1;
        else if (!word.startsWith("-")) words.push(word);
      }
      // `repo`, `sync`, then the destination.
      if (words.length > 2) {
        if (flag("--force", "", "")) deny("force-push", "A forced sync of a repository (`gh repo sync --force`)");
        // A branch flag whose value the line ends before, an unquoted substitution having cut it, shows none.
        if (branches.length === 0 || branches.some((name) => name === "" || /[$`]/.test(name) || defaults.has(branch(name)))) {
          deny("push-default", "A sync of a repository's default branch, or of a branch the line cannot show (`gh repo sync`)");
        }
      }
    }
    if (group === "repo" && sub === "edit") {
      // A repository made public cannot be made private again in effect; every other settings flag can be undone.
      if (cmd.some((word) => /^--visibility(=|$)/.test(word))) {
        deny("repo-irreversible", "A visibility change (`gh repo edit --visibility`)");
      }
      if (cmd.some((word) => /^--default-branch(=|$)/.test(word))) {
        deny("protection", "A default-branch change (`gh repo edit --default-branch`)");
      } else deny("protection", "A repository settings write (`gh repo edit`)");
    }
    if (group === "api") httpVerdict(cmd);
  }

  /**
   * A REST or GraphQL person-only act; each path is read below its repository or organisation. A body field is read
   * only where a field starts (review/99): a gh field word's own `key=`, a top-level key of a JSON body, or in a
   * GraphQL text (a `query` field) an argument of the call it belongs to, string literals and comments read as no
   * syntax. A field the line does not show reads as the API's default (no `branch` on a contents write is the
   * default branch, no `force` is off); one it shows but cannot place (a computed `$…` value, `-F k=@file`, a
   * GraphQL variable or block string) reads as the denying value: the default branch, or forced. On a review, a body
   * the line cannot show at all (gh's `--input`, a `-F` field read from `@<file>`, a curl or wget body that is no JSON
   * object literal, a file or a form, stdin among them) reads as the denying value too (review/228).
   */
  function httpVerdict(line: string[]): void {
    const gh = line[0] === "gh";
    // gh fills `{branch}` and `:branch` (its own placeholder pattern) from the checkout, in the endpoint and in a typed
    // `-F` field (review/127): the current branch, or the default branch where the checkout is on none.
    const fill = (value: string): string =>
      value.replace(/\{branch\}|:branch\b/g, () => (ctx.currentBranch === null ? "main" : branch(ctx.currentBranch)));
    // The words as `httpCall` reads them, wget's shortened method and body options expanded (pr/11).
    const { write, method, paths: targets, cmd, next } = httpCall(line);
    // The call after `--next` (pr/72), its acts collected beside this call's (v0a).
    if (next !== null) httpVerdict(next);
    const paths = gh ? targets.map(fill) : targets;
    const text = cmd.join(" ");
    const fieldFlag = gh ? /^(-[fF]|--field|--raw-field)$/ : /^(-[A-Za-z]*d|--data(-raw|-binary|-ascii|-urlencode)?|--json|--post-data|--body-data)$/;
    const fieldAttached = gh ? /^(-[fF]|--field=|--raw-field=)/ : /^(-d|--(data(-raw|-binary|-ascii|-urlencode)?|json|post-data|body-data)=)/;
    /** Each body field as `[key, value]`, `null` for a value the line cannot place. */
    const bodyFields: [string, string | null][] = [];
    const queries: string[] = [];
    /** Whether the line sends a body, or a field of one, it cannot show (review/228). */
    let hiddenBody = false;
    const add = (key: string, value: unknown, typed: boolean): void => {
      const shown = typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? String(value) : null;
      // A typed `-F` field reads a literal `null` as JSON null, and its placeholders filled (review/127).
      const placed = typed && shown !== null ? (shown === "null" ? null : fill(shown)) : shown;
      if (key === "query" && typeof value === "string" && !(typed && value.startsWith("@"))) queries.push(typed ? fill(value) : value);
      else bodyFields.push([key, placed === null || /[$`]/.test(placed) || (typed && placed.startsWith("@")) ? null : placed]);
    };
    for (let k = 1; k < cmd.length; k += 1) {
      const word = cmd[k] ?? "";
      // gh's body file, and curl's or wget's upload, form or body file, attached or in a short cluster before its `X`.
      const named = word.split("=")[0] ?? "";
      if (
        gh
          ? named === "--input"
          : ["-F", "-T", "--upload-file", "--form", "--form-string", "--post-file", "--body-file"].includes(named) ||
            /^-[FT]./.test(word) ||
            (/^-[A-Za-z]{2,}$/.test(word) && /[FT]/.test(word.split("X")[0] ?? ""))
      ) {
        hiddenBody = true;
      }
      let value = fieldAttached.exec(word)?.[0];
      if (fieldFlag.test(word)) {
        value = cmd[k + 1];
        k += 1;
      } else if (value !== undefined) value = word.slice(value.length);
      if (value === undefined) continue;
      if (gh) {
        const eq = value.indexOf("=");
        if (eq > 0) add(value.slice(0, eq), value.slice(eq + 1), /^(-F|--field)/.test(word));
        // A typed field gh reads from a file, or from stdin (`@-`).
        if (/^(-F|--field)/.test(word) && value.slice(eq + 1).startsWith("@")) hiddenBody = true;
        continue;
      }
      try {
        const body: unknown = JSON.parse(value);
        if (typeof body === "object" && body !== null && !Array.isArray(body)) {
          for (const [key, field] of Object.entries(body)) add(key, field, false);
        } else hiddenBody = true;
      } catch {
        // Not a JSON body (`@<file>`, `@-`, a computed value): none of its fields is shown.
        hiddenBody = true;
      }
    }
    const fields = (key: string): (string | null)[] => bodyFields.filter(([name]) => name === key).map(([, value]) => value);
    const landsOnDefault = (values: readonly (string | null)[]): boolean =>
      values.length === 0 || values.some((value) => value === null || value === "" || defaults.has(branch(value)));
    const forced = (values: readonly (string | null)[]): boolean =>
      values.some((value) => value === null || !["false", "0", "no", "off", ""].includes(value.toLowerCase()));
    /** A GraphQL text with its string literals and comments masked, so a call, a key or a bracket inside one is no syntax. */
    const mask = (query: string): string =>
      query.replace(/"""[\s\S]*?"""|"(?:\\.|[^"\\])*"|#[^\n]*/g, (lit) => (lit.startsWith('"') ? '"' : " ").padEnd(lit.length));
    /** The argument value written at `at` in `query`. */
    const valueAt = (query: string, at: number): string | null => {
      const after = query.slice(at);
      const literal = after.startsWith('"""') ? undefined : /^"(?:\\.|[^"\\])*"/.exec(after)?.[0];
      // A bare token (`true`, an enum) as written; a variable, a block string, a list or an object is `null`.
      let value: string | null = /^[\w.-]+/.exec(after)?.[0] ?? null;
      if (literal !== undefined) {
        try {
          const decoded: unknown = JSON.parse(literal);
          value = typeof decoded === "string" && !/[$`]/.test(decoded) ? decoded : null;
        } catch {
          value = null;
        }
      }
      return value;
    };
    /** Per call of the GraphQL field `name` in the line's GraphQL texts, its argument span `[start, end)`. */
    const spans = (name: string): [query: string, masked: string, start: number, end: number][] => {
      const found: [string, string, number, number][] = [];
      for (const query of queries) {
        const masked = mask(query);
        for (const call of masked.matchAll(new RegExp(`\\b${name}\\s*\\(`, "g"))) {
          const start = (call.index ?? 0) + call[0].length;
          let end = start;
          for (let level = 1; end < masked.length; end += 1) {
            if (masked[end] === "(") level += 1;
            else if (masked[end] === ")") level -= 1;
            if (level === 0) break;
          }
          found.push([query, masked, start, end]);
        }
      }
      return found;
    };
    /** Per call of the GraphQL field `name` in the line's GraphQL texts, the values its own arguments give `key`. */
    const calls = (name: string, key: string): (string | null)[][] =>
      spans(name).map(([query, masked, start, end]) =>
        [...masked.slice(start, end).matchAll(new RegExp(`\\b${key}\\s*:\\s*`, "g"))].map((arg) =>
          valueAt(query, start + (arg.index ?? 0) + arg[0].length)));
    /**
     * Each `updateRefs` entry's `name` and `afterOid` (v0a), `null` where the line cannot show it: an entry, a list or
     * an input given whole as a variable reads as an entry whose name and `afterOid` are both hidden.
     */
    const refEntries = (): { name: string | null; oid: string | null }[] => {
      const entries: { name: string | null; oid: string | null }[] = [];
      const read = (query: string, masked: string, from: number, to: number, key: string): string | null => {
        const arg = new RegExp(`\\b${key}\\s*:\\s*`).exec(masked.slice(from, to));
        return arg === null ? null : valueAt(query, from + arg.index + arg[0].length);
      };
      for (const [query, masked, start, end] of spans("updateRefs")) {
        const list = /\brefUpdates\s*:\s*/.exec(masked.slice(start, end));
        let k = list === null ? end : start + list.index + list[0].length;
        if (masked[k] !== "[") {
          entries.push({ name: null, oid: null });
          continue;
        }
        let depth = 0;
        let from = k;
        for (k += 1; k < end; k += 1) {
          const ch = masked[k];
          if (depth === 0 && ch === "]") break;
          if (ch === "{") {
            if (depth === 0) from = k;
            depth += 1;
          } else if (ch === "}") {
            depth -= 1;
            if (depth === 0) entries.push({ name: read(query, masked, from, k, "name"), oid: read(query, masked, from, k, "afterOid") });
          } else if (ch === "$" && depth === 0) entries.push({ name: null, oid: null });
        }
      }
      return entries;
    };
    /** Whether a call of `name` the line names lands on the default branch: none readable, or one not placed there. */
    const callsLand = (name: string, key: string): boolean => {
      const found = calls(name, key);
      return found.length === 0 || found.some(landsOnDefault);
    };
    // Every act of the call is collected (v0a): each GraphQL mutation and `updateRefs` entry, and each path's act.
    for (const path of paths) {
      const shown = `${method} ${path}`;
      if (/^graphql$/i.test(path)) {
        // A pull request added to the merge queue is merged by the queue later (pr/57).
        if (/\b(mergePullRequest|enablePullRequestAutoMerge|enqueuePullRequest)\b/.test(text)) deny("pr-merge", "A GraphQL merge");
        if (/\bmarkPullRequestReadyForReview\b/.test(text)) deny("pr-ready", "A GraphQL ready-for-review");
        // pr/74, from GitHub's schema read on 2026-10-18; a protection rule's, a ruleset's or a property's deletion is
        // refuse-class (v0a).
        if (/\b(deleteBranchProtectionRule|deleteRepositoryRuleset|deleteRepositoryCustomProperty)\b/.test(text)) {
          deny("protection-delete", "A GraphQL protection, ruleset or custom property deletion");
        }
        if (
          /\b(archiveRepository|unarchiveRepository|updateRepository(CustomProperty|Ruleset|WebCommitSignoffSetting)?|(create|update)(BranchProtectionRule|RepositoryRuleset)|(create|promote)RepositoryCustomProperty|setRepositoryCustomPropertyValues)\b/.test(text)
        ) {
          deny("protection", "A GraphQL repository settings, protection or ruleset write");
        }
        // A review added or submitted with the event `APPROVE` (review/210); an event the line cannot show (a variable,
        // a call it cannot find) reads as one, and a review with no event is the API's pending one.
        if (/\b(addPullRequestReview|submitPullRequestReview)\b/.test(text)) {
          const reviews = [...calls("addPullRequestReview", "event"), ...calls("submitPullRequestReview", "event")];
          const variables = queries.some((query) => mask(query).includes("$"));
          if (
            reviews.length === 0 ||
            reviews.some((events) => (events.length === 0 && variables) || events.some((event) => event === null || /^approve$/i.test(event)))
          ) {
            deny("pr-merge", "A GraphQL review approval, or a review whose event the line cannot show");
          }
        }
        if (/\bcreateCommitOnBranch\b/.test(text) && callsLand("createCommitOnBranch", "branchName")) {
          deny("push-default", "A GraphQL commit to the default branch");
        }
        if (/\bmergeBranch\b/.test(text) && callsLand("mergeBranch", "base")) {
          deny("push-default", "A GraphQL merge into the default branch");
        }
        if (/\bupdateRefs?\b/.test(text)) {
          if ([...calls("updateRef", "force"), ...calls("updateRefs", "force")].some(forced)) {
            deny("force-push", "A forced GraphQL ref update");
          }
          // An entry to the zero sha deletes its ref, and one whose `afterOid` the line cannot show reads as a deletion
          // (v0a): a tag's under `refs/tags/`, any other a branch's.
          for (const entry of refEntries()) {
            if (entry.oid !== null && !/^(0{40}|0{64})$/.test(entry.oid)) continue;
            if (entry.name !== null && /^refs\/tags\//i.test(entry.name)) deny("tag-delete", "A GraphQL tag ref deletion");
            else deny("push-delete", "A GraphQL ref deletion, or a ref update whose target the line cannot show");
          }
          // The batch form names each ref (review/108); the single form names it by id, which the line cannot show.
          if (calls("updateRefs", "name").flat().some((ref) => ref !== null && /^refs\/tags\//i.test(ref))) {
            deny("push-tags", "A GraphQL tag ref update");
          }
          // A list element given whole as a variable, beside literal ones, names a ref the line cannot show (review/128).
          const hidden = queries.some((query) => /\brefUpdates\s*:\s*\[(?:[^\]]*,)?\s*\$/.test(mask(query)));
          if (/\bupdateRef\b/.test(text) || hidden || callsLand("updateRefs", "name")) {
            deny("push-default", "A GraphQL ref update onto the default branch, or onto a ref the line cannot show");
          }
        }
        // The GraphQL twins of the REST ref writes (build/75): any ref deletion, and a ref created as a tag or on the
        // default branch, a name the line cannot show reading as a tag.
        if (/\bdeleteRef\b/.test(text)) deny("push-delete", "A GraphQL ref deletion");
        if (/\bcreateRef\b/.test(text)) {
          const created = calls("createRef", "name");
          if (created.length === 0 || created.some((refs) => refs.length === 0 || refs.some((ref) => ref === null || /^refs\/tags\//i.test(ref)))) {
            deny("push-tags", "A GraphQL tag ref created, or a ref the line cannot show");
          } else if (created.flat().some((ref) => ref !== null && defaults.has(branch(ref)))) {
            deny("push-default", "A GraphQL ref created on the default branch");
          }
        }
        continue;
      }
      if (write) restAct(path, shown);
    }

    /**
     * The acts of one REST write path below its repository or organisation (v0a): every rule the path matches is
     * collected, so a refuse-class reading of a path decides it even where an ask-class rule matches it too (review/33).
     */
    function restAct(path: string, shown: string): void {
      if (/^pulls\/[^/]+\/merge(-async)?(\/|$)/i.test(path)) deny("pr-merge", `A REST merge (${shown})`);
      // A review created, or a pending one submitted, with the event `APPROVE` (review/210); an event the line shows
      // but cannot place reads as one, and so does a body the line cannot show (review/228), as on GraphQL; no event in
      // a body the line shows whole is the API's pending review.
      if (
        /^pulls\/[^/]+\/reviews(\/[^/]+\/events)?$/i.test(path) &&
        (hiddenBody || fields("event").some((event) => event === null || /^approve$/i.test(event.trim())))
      ) {
        deny("pr-merge", `A REST review approval, or a review whose body the line cannot show (${shown})`);
      }
      // A custom property, which a ruleset can target repositories by (pr/80).
      if (/^branches\/.+\/protection(\/|$)/i.test(path) || /^(rulesets|properties)(\/|$)/i.test(path)) {
        if (method === "DELETE") deny("protection-delete", `A protection, ruleset or custom property deletion (${shown})`);
        else deny("protection", `A protection or ruleset write (${shown})`);
      }
      // A deployment environment: deleting it deletes its secrets, variables and protection rules with it, so it is
      // refuse-class; creating or updating it sets its protection rules (review/38). Its name may hold a slash, sent as
      // `%2F` and decoded above, so the three environment rules read the name as `branches/.+/protection` reads a branch
      // (review/51); this one stops short of a path that goes on into a sub-resource the two below read.
      if (/^environments\/(?!.+\/(deployment_protection_rules|deployment-branch-policies|secrets|variables)(\/|$)).+$/i.test(path)) {
        if (method === "DELETE") deny("protection-delete", `A deployment environment deletion (${shown})`);
        else if (method === "PUT") deny("protection", `A deployment environment write (${shown})`);
      }
      // An environment's deployment protection rule or branch policy: removing one lowers what gates a deployment to it,
      // refuse-class as a branch protection deletion is; creating or changing one is ask-class (review/51).
      if (/^environments\/.+\/(deployment_protection_rules|deployment-branch-policies)(\/|$)/i.test(path)) {
        if (method === "DELETE") deny("protection-delete", `A deployment protection rule or branch policy deletion (${shown})`);
        else deny("protection", `A deployment protection rule or branch policy write (${shown})`);
      }
      // The repository's own path carries its default branch, visibility, name and archived state; DELETE removes it.
      // A body holding `visibility` or `private`, or one the line cannot show, may change the visibility (v0a).
      if (/^(repos\/[^/]+\/[^/]+|repositories\/[^/]+)$/i.test(path) && (method === "PATCH" || method === "DELETE")) {
        if (method === "DELETE") deny("repo-delete", `A repository settings write or deletion (${shown})`);
        else if (hiddenBody || fields("visibility").length > 0 || fields("private").length > 0) {
          deny("repo-irreversible", `A repository visibility change, or a settings write whose body the line cannot show (${shown})`);
        } else deny("protection", `A repository settings write or deletion (${shown})`);
      }
      if (/^branches\/.+\/rename$/i.test(path)) deny("protection", `A branch rename (${shown})`);
      if (/^transfer$/i.test(path)) deny("repo-irreversible", `A repository transfer (${shown})`);
      if (/^contents(\/|$)/i.test(path) && landsOnDefault(fields("branch"))) {
        deny("push-default", `A REST commit to the default branch (${shown})`);
      }
      if (
        (/^merges$/i.test(path) && landsOnDefault(fields("base"))) ||
        (/^merge-upstream$/i.test(path) && landsOnDefault(fields("branch")))
      ) {
        deny("push-default", `A REST merge into the default branch (${shown})`);
      }
      // The user's own Codespaces secrets sit at `user/codespaces/secrets`, which no owner cut above reaches (review/76).
      if (/^((actions|dependabot|codespaces|agents|user\/codespaces)|environments\/.+)\/(secrets|variables)(\/|$)/i.test(path)) {
        if (method === "DELETE") deny("secrets-delete", `A secret or variable deletion (${shown})`);
        else deny("secrets", `A secret or variable write (${shown})`);
      }
      if (/^releases(\/|$)/i.test(path)) {
        if (method === "DELETE") deny("release-delete", `A release or asset deletion (${shown})`);
        else deny("release", `A release write (${shown})`);
      }
      if (/^git\/refs(\/|$)/i.test(path)) refAct(path, shown);
    }

    /** The act of a REST write on a `git/refs` path, the refuse-class readings first (v0a). */
    function refAct(path: string, shown: string): void {
      if (method === "DELETE") {
        if (/^git\/refs\/tags(\/|$)/i.test(path)) deny("tag-delete", `A REST tag ref deletion (${shown})`);
        else deny("push-delete", `A REST ref deletion (${shown})`);
        return;
      }
      // Force is read before tags (v0a): a forced tag move is refuse-class, a tag write ask-class. An update whose body
      // the line cannot show may set `force`, so it reads as forced, as a hidden GraphQL `afterOid` reads as a
      // deletion (review/36).
      if (forced(fields("force")) || (method === "PATCH" && hiddenBody)) {
        deny("force-push", `A forced REST ref update, or one whose body the line cannot show (${shown})`);
        return;
      }
      // A body's `ref` read from the line's text and as the parsed field (pr/1), a JSON body's quote before it among
      // the spellings; one the line cannot place reads as a tag.
      const refs = fields("ref");
      if (
        /^git\/refs\/tags(\/|$)/i.test(path) ||
        /(^|[=\s])refs\/tags\//i.test(text) ||
        refs.some((ref) => ref === null || /^refs\/tags\//i.test(ref))
      ) {
        deny("push-tags", `A REST tag ref write (${shown})`);
        return;
      }
      // The path's own ref read from the path as routing reads it (review/107); a body's `ref` from the line.
      const heads = [/^git\/refs\/heads\/(.+)$/i.exec(path)?.[1] ?? "", ...[...text.matchAll(/(?:^|[=\s/])refs\/heads\/(\S+)/gi)].map((match) => match[1] ?? ""),
        ...refs.map((ref) => /^refs\/heads\/(.+)$/i.exec(ref ?? "")?.[1] ?? "")];
      if (heads.some((name) => defaults.has(name.toLowerCase()))) {
        deny("push-default", `A REST write to the default branch (${shown})`);
      }
    }
  }

  function publishVerdict(cmd: string[]): PersonOnlyVerdict | null {
    const valued = new Set(["--registry", "--workspace", "-w", "--prefix", "-C", "--dir", "--filter", "--userconfig",
      "--cwd", "--tag", "--otp", "--access"]);
    const npm = cmd[0] === "npm";
    /**
     * The positional words; with `settings`, npm's own reading of any `--<key> <value>` before its subcommand as a
     * setting (`npm --loglevel silly publish`, pr/50). Both readings are taken, so a boolean option before the
     * subcommand (`npm --json publish`) still reads the next word as the subcommand. npm reads a single-dash setting
     * too (`-loglevel silly`, `-c run`), and the reading never takes `publish` or its prefix as a value (pr/66):
     * not skipping it only adds a refusal. It keeps `run`, `run-script`, `exec` and `x` only after an option npm reads
     * with no value (npm 10.9.8's Boolean settings and its loglevel shorthands, pr/68), because a setting that takes a
     * value takes `run` too (`npm --cache run publish` publishes).
     */
    const flags = new Set(["--json", "--dry-run", "--force", "--global", "--parseable", "--color", "--no-color",
      "--silent", "--quiet", "--verbose", "-s", "-q", "-d", "-g", "-f", "-p"]);
    const kept = (option: string, next: string): boolean =>
      /^pu(?:b(?:l(?:i(?:sh?)?)?)?)?$/.test(next) ||
      (flags.has(option.replace(/^-(?=[^-]{2})/, "--")) && ["run", "run-script", "exec", "x"].includes(next));
    const positionalsOf = (settings: boolean): string[] => {
      const positionals: string[] = [];
      for (let k = 1; k < cmd.length; k += 1) {
        const word = cmd[k] ?? "";
        const next = cmd[k + 1] ?? "-";
        if (valued.has(word)) k += 1;
        else if (settings && positionals.length === 0 && /^-{1,2}[^-=][^=]*$/.test(word) && !next.startsWith("-") && !kept(word, next)) k += 1;
        else if (!word.startsWith("-")) positionals.push(word);
      }
      return positionals;
    };
    // `publish` as the subcommand, or after a package manager's word (`yarn npm publish`, `npm --workspace x exec --
    // npm publish`) or yarn's `workspace <name>` (pr/3), the forms that run it in place of a script of that name.
    // Where the manager is npm, any unique prefix of it counts (`npm pub`, pr/50): npm runs a command's unique prefix
    // as the command, and `pu` is the shortest of `publish`'s, `pr…` and `pa…` being prune's and pack's.
    const publishes = [positionalsOf(false), ...(npm ? [positionalsOf(true)] : [])].some((positionals) =>
      positionals.some(
        (word, index) =>
          (word === "publish" ||
            ((index === 0 ? npm : positionals[index - 1] === "npm") && /^pu(?:b(?:l(?:i(?:sh?)?)?)?)?$/.test(word))) &&
          (index === 0 ||
            ["npm", "pnpm", "yarn", "bun"].includes(positionals[index - 1] ?? "") ||
            (cmd[0] === "yarn" && index === 2 && positionals[0] === "workspace")),
      ),
    );
    // npm's `unpublish` (from its unique prefix `unp`) and `dist-tag rm` withdraw what a publish put out, refuse-class;
    // `dist-tag add` moves a tag, ask-class as a publish (v0a). The prefix and the subcommands' aliases are npm
    // 10.9.8's (`lib/utils/cmd-list.js`, `lib/commands/dist-tag.js`), read where npm runs them: pnpm hands both
    // commands, as written, to npm, and yarn's `npm tag remove` and `npm tag add`, and yarn classic's `tag remove` and
    // `tag add`, are the same acts (review/34, review/37, review/52). No prefix of `dist-tag` resolves in that list (its
    // alias `dist-tags` shares every one).
    for (const positionals of npm ? [positionalsOf(false), positionalsOf(true)] : [positionalsOf(false)]) {
      for (const [index, word] of positionals.entries()) {
        const passed = index === 0 && cmd[0] === "pnpm" && (word === "unpublish" || word === "dist-tag");
        // yarn classic's own `tag` command, where yarn reads its command word: first, or after `workspace <name>` (review/52).
        const own = cmd[0] === "yarn" && word === "tag" && (index === 0 || (index === 2 && positionals[0] === "workspace"));
        if (!passed && !own && !(index === 0 ? npm : positionals[index - 1] === "npm")) continue;
        if (/^unp(?:u(?:b(?:l(?:i(?:sh?)?)?)?)?)?$/.test(word)) deny("unpublish", "Withdrawing a package (`npm unpublish`)");
        const tags = word === "dist-tag" || word === "dist-tags" || (cmd[0] === "yarn" && word === "tag");
        const action = tags ? (positionals[index + 1] ?? "") : "";
        if (["rm", "r", "del", "d", "remove"].includes(action)) deny("unpublish", "A dist-tag removed (`npm dist-tag rm`)");
        if (["add", "a", "set", "s"].includes(action)) deny("publish", "A dist-tag moved (`npm dist-tag add`)");
      }
    }
    return publishes ? deny("publish", `Publishing a package (\`${cmd[0]} publish\`)`) : null;
  }

  // Each segment's acts are collected (v0a); the readers record them through `deny`.
  for (const cmd of commandsOf(command, 0, false)) {
    const program = cmd[0] ?? "";
    if (program === "git") {
      const { sub, args, config } = gitParts(cmd);
      // `git send-pack` pushes as `git push` does, its options and refspecs laid out the same (pr/16); with
      // no ref it updates the refs both sides have, the default branch among them, read as a matching push.
      if (sub === "push") pushVerdict(args, config);
      else if (sub === "send-pack") pushVerdict(args, [...config, "push.default=matching"]);
      else if (sub === "tag") tagVerdict(args);
      else if (
        sub === "update-ref" &&
        (args.some((arg) => /^(refs\/)?tags\//i.test(arg)) || (args.includes("--stdin") && /refs\/tags\//i.test(command)))
      ) {
        // `git update-ref` writes or deletes a ref by name (pr/53): a tag ref named on the line, or in a `--stdin` text
        // the line itself carries, is a tag created or deleted. A `--stdin` text read from a file is the residual.
        // A deletion (`-d`, a zero new value, a `delete` command or a zero sha in that text, read in excess) is
        // refuse-class (v0a).
        const zero = /(^|[^0-9a-f])(0{40}|0{64})([^0-9a-f]|$)/i;
        const [, value = ""] = args.filter((arg, index) => !arg.startsWith("-") && args[index - 1] !== "-m");
        // `-d` in a short cluster before the reason option (`-dm <reason>`), and a `--stdin` `update` of a tag ref whose
        // new value is empty, which git reads as the zero value (review/35): the ref not followed by one separator (a
        // space, or an escape such as `-z`'s NUL) and a value.
        const word = String.raw`[^\s'"\\|;&<>()]`;
        const separator = String.raw`(?: |\\(?:x[\da-fA-F]{1,2}|u[\da-fA-F]{1,4}|[0-7]{1,4}))`;
        // The `update` stands first, after a character that is no word's, or after an escaped line break (`\n`, `\0`,
        // `\x0a`, `\012`) or a printf placeholder (`%b`), as the symref reader below reads a command; `symref-update`'s
        // dash keeps it out (review/35).
        const before = String.raw`(?<=^|[^\w-]|\\(?:x[\da-fA-F]{1,2}|u[\da-fA-F]{1,4}|U[\da-fA-F]{1,8}|[0-7]{1,4}|[a-zA-Z])|%[-#0+ \d.]*[a-zA-Z])`;
        const emptied = new RegExp(String.raw`${before}update${separator}+refs\/tags\/${word}+(?!${word})(?!${separator}${word})`, "i");
        if (
          args.some((arg) => /^-[^-m]*d/.test(arg)) ||
          zero.test(value) ||
          (args.includes("--stdin") && (/\bdelete\b/.test(command) || zero.test(command) || emptied.test(command)))
        ) {
          deny("tag-delete", "A tag ref deleted (`git update-ref`)");
        } else deny("tag", "A tag ref write (`git update-ref`)");
      } else if (sub === "update-ref" && args.includes("--stdin")) {
        // git 2.46's symref commands in that text (pr/82), by `git symbolic-ref`'s rules: `symref-create` and
        // `symref-update` as `<ref> <target>`, `symref-delete` as `-d <ref>`. A target missing or a printf placeholder
        // is one the line cannot show; a space, a quote or an escape (`\n`, `\0`, `\x00`, ` `) ends a word. A
        // command is read wherever it stands: the line break before it may be an escape or a `%b` placeholder ending in a
        // letter or a digit, and a command read in excess only adds a denial.
        const word = String.raw`(?:[\s'"]|\\(?:x[\da-fA-F]{1,2}|u[\da-fA-F]{1,4}|U[\da-fA-F]{1,8}|[0-7]{1,4}|[a-z]))+([^\s'"\\|;&<>()]+)`;
        for (const [, op, ref = "", target] of command.matchAll(new RegExp(String.raw`symref-(create|update|delete)${word}(?:${word})?`, "g"))) {
          const shown = target === undefined || target.includes("%") ? "$" : target;
          symbolicRefVerdict(op === "delete" ? ["-d", ref] : [ref, shown], "git update-ref --stdin");
        }
      } else if (sub === "symbolic-ref") symbolicRefVerdict(args);
      else if (sub === "subtree") {
        // `git subtree push <remote> <branch>` runs `git push <remote> <split>:refs/heads/<branch>`.
        const valued = new Set(["-P", "--prefix", "-m", "--message", "-b", "--branch", "--onto"]);
        const words = args.filter((word, index) => !word.startsWith("-") && !valued.has(args[index - 1] ?? ""));
        if (words[0] === "push") pushVerdict(words.slice(1), config);
      }
    } else if (program === "gh") ghVerdict(cmd);
    else if (program === "curl" || program === "wget") httpVerdict(cmd);
    else if (["npm", "pnpm", "yarn", "bun"].includes(program)) publishVerdict(cmd);
  }
  // A refuse-class act decides the line; with none, the first act asks (v0a).
  return acts.find((act) => !act.ask) ?? acts[0] ?? { deny: false };
}

/**
 * Whether `command` steps around the run verbs while a run is unattended
 * (REQ-FLOW-120): any `git push` or `git subtree push`, `gh pr create`, `gh pr edit`, `gh pr close`, `gh pr
 * reopen` or `gh pr update-branch`, `gh repo sync` or `gh repo create --push` (or its alias `gh repo new`), a git call
 * defining an alias (`-c alias.<name>=…`) or naming a subcommand that is not a git builtin (an alias, a computed name)
 * outside the read and setup forms of `git lfs` (fetch, pull, install, ls-files, env, status) and `git submodule`
 * (status, init, update, sync), a git call on a line that names one of git's configuration variables
 * (`GIT_CONFIG_COUNT`, `GIT_CONFIG_GLOBAL`, …) or sets a program-valued one (`GIT_EDITOR`, `GIT_SSH_COMMAND`, …), any
 * line that sets one of either, whatever its program, a
 * `git remote` write (`add`, `set-url`, `rename`, `remove`, `set-head`, `set-branches`) or a
 * `git config` write of a `remote.*` key, and a `gh
 * api`, `curl` or `wget` write (POST, PATCH, PUT, DELETE) on a repository's
 * `pulls` or `pulls/<n>`, on `contents/…`, on `git/` refs or objects, or on
 * `merges`, with their GraphQL twins. A reply on `pulls/<n>/comments` or
 * `issues/<n>/comments` passes. A `gh` group outside gh's built-in commands (an
 * alias or an extension), `gh alias set` or `import` and `gh extension exec` are refused too. The line
 * is read as {@link personOnlyVerdict} reads it, and throws as it does; with `powershell`, as PowerShell's command string
 * (the PowerShell tool's text), a POSIX shell's reading beside it.
 *
 * A run verb stands alone on its line (REQ-FLOW-121): a line that runs `stamity run start`, `checkpoint` or `end`, or
 * names one beside the package, is refused unless it is that one simple command, so nothing on the line changes the
 * environment the verb's git runs in.
 *
 * Self-contained, so the emitted guard can carry it as source (see the module
 * comment).
 */
export function unattendedPushVerdict(command: string, powershell = false): UnattendedPushVerdict {
  // <shell-reading>
  const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;
  const KEYWORDS = new Set(["!", "{", "}", "if", "then", "else", "elif", "fi", "do", "done", "while", "until"]);
  const WRAPPERS = new Set(["env", "command", "builtin", "exec", "nohup", "sudo", "doas", "nice", "timeout", "stdbuf", "time", "xargs",
    "npx", "bunx", "pnpx", "corepack"]);
  /**
   * Package runners spelled as a program and a subcommand; each runs its first positional word as a program, or
   * (`bun exec`, yarn's `exec`) as a shell line.
   */
  const RUNNERS = new Set(["npm exec", "npm x", "pnpm dlx", "pnpm exec", "yarn dlx", "yarn exec", "bun x", "bun exec"]);
  const RUNNER_OPTIONS: readonly [string, string[], string[]] = ["pw", ["--package", "--workspace", "--filter"], ["-c", "--call", "--shell-mode"]];
  const NO_OPTIONS: readonly [string, string[], string[]] = ["", [], []];
  /**
   * The package managers whose options can stand before a runner's subcommand (`npm -w x exec`, `pnpm --filter x exec`,
   * pr/3): those that take a value, skipped with it, and yarn's `workspace <name>`, which runs a yarn command there.
   */
  const MANAGERS = new Set(["npm", "pnpm", "yarn", "bun"]);
  const MANAGER_VALUED = new Set(["-w", "--workspace", "--filter", "-F", "--prefix", "-C", "--dir", "--cwd", "--registry", "--userconfig"]);
  /**
   * Per wrapper: the short letters and the long options that take a value (the next word when nothing is attached),
   * and the options whose value is a command line of its own (`env -S`, a runner's `-c`).
   */
  const WRAPPER_OPTIONS = new Map<string, readonly [string, string[], string[]]>([
    ["env", ["uCP", ["--unset", "--chdir"], ["-S", "--split-string"]]],
    ["sudo", ["ugpCrtUDRT", ["--user", "--group", "--prompt", "--close-from", "--role", "--type", "--other-user", "--chdir",
      "--chroot", "--command-timeout", "--host"], []]],
    ["doas", ["uC", [], []]],
    ["exec", ["a", [], []]],
    ["nice", ["n", ["--adjustment"], []]],
    ["timeout", ["sk", ["--signal", "--kill-after"], []]],
    ["stdbuf", ["ioe", ["--input", "--output", "--error"], []]],
    ["time", ["fo", ["--format", "--output"], []]],
    ["xargs", ["ILnPsdEa", ["--max-args", "--max-procs", "--max-chars", "--delimiter", "--arg-file", "--process-slot-var"], []]],
    ["npx", RUNNER_OPTIONS],
    ["bunx", RUNNER_OPTIONS],
    ["pnpx", RUNNER_OPTIONS],
  ]);
  /** The one-letter escapes of ANSI-C quoting (`$'…'`). */
  const ANSI_ESCAPES = new Map([["n", "\n"], ["t", "\t"], ["r", "\r"], ["a", "\x07"], ["b", "\b"], ["e", "\x1b"], ["E", "\x1b"],
    ["f", "\f"], ["v", "\v"], ["\\", "\\"], ["'", "'"], ['"', '"'], ["?", "?"]]);
  const SHELLS = new Set(["sh", "bash", "zsh", "dash", "ksh"]);
  /** PowerShell's two hosts and `Invoke-Expression`, each running a command string of its own (build/89). */
  const POWERSHELLS = new Set(["pwsh", "powershell", "invoke-expression", "iex"]);
  /** The quotes PowerShell opens and closes with: `'` and U+2018 to U+201B, `"` and U+201C to U+201E (v0b). */
  const PS_SINGLE = "'" + String.fromCharCode(0x2018, 0x2019, 0x201a, 0x201b);
  const PS_DOUBLE = '"' + String.fromCharCode(0x201c, 0x201d, 0x201e);

  /**
   * A program word as the shell finds it: its last path part, without case or a Windows suffix, and without a trailing
   * `@<version>`, which a runner reads as the version to run (`npx npm@10`, `corepack pnpm@9`, pr/51).
   */
  function programName(word: string): string {
    const last = word.split(/[\\/]/).pop() ?? "";
    return last.toLowerCase().replace(/^([^@]+)@[\s\S]*$/, "$1").replace(/\.(exe|cmd|bat)$/, "");
  }

  /**
   * PowerShell's `-Command` (any prefix of it, `-c` among them, or of `-CommandWithArgs`, or `-cwa`) after `-`, `--`
   * or `/`: the value attached after a `:` (`""` when none), or `null` when `word` is another word.
   */
  function commandFlag(word: string): string | null {
    const match = /^(?:--?|\/)([a-z]+)(?::([\s\S]*))?$/i.exec(word);
    const name = (match?.[1] ?? "").toLowerCase();
    return name !== "" && ("commandwithargs".startsWith(name) || name === "cwa") ? (match?.[2] ?? "") : null;
  }

  /**
   * The words of each simple command in `text`, a command substitution's text read as its own lines; with `blocks`, a
   * brace attached to a word starts or ends a PowerShell script block (`{git push}`), a brace a word opened (`@{1}`,
   * `${x}`) staying part of it; with `pwsh`, PowerShell's escape (review/194): the backtick escapes, a backslash is a
   * plain character.
   */
  function splitLine(text: string, blocks: boolean, pwsh: boolean): { segments: string[][]; nested: string[] } {
    const segments: string[][] = [];
    const nested: string[] = [];
    let words: string[] = [];
    let word = "";
    let inWord = false;
    let dropNext = false;
    const endWord = (): void => {
      if (!inWord) return;
      if (dropNext) dropNext = false;
      else words.push(word);
      word = "";
      inWord = false;
    };
    const cut = (): void => {
      endWord();
      dropNext = false;
      if (words.length > 0) segments.push(words);
      words = [];
    };
    // PowerShell's reading takes its typographic quotes as quotes too, so an act after one is read, not hidden.
    const quote = (c: string | undefined, kind: string): boolean => c !== undefined && (c === kind[0] || (pwsh && kind.includes(c)));
    let i = 0;
    while (i < text.length) {
      const ch = text[i] ?? "";
      if (quote(ch, PS_SINGLE)) {
        let stop = i + 1;
        while (stop < text.length && !quote(text[stop], PS_SINGLE)) stop += 1;
        word += text.slice(i + 1, stop);
        inWord = true;
        i = stop + 1;
      } else if (quote(ch, PS_DOUBLE)) {
        inWord = true;
        i += 1;
        while (i < text.length && !quote(text[i], PS_DOUBLE)) {
          const c = text[i] ?? "";
          const next = text[i + 1] ?? "";
          if (pwsh && c === "`" && i + 1 < text.length) {
            word += next;
            i += 2;
          } else if (!pwsh && c === "\\" && i + 1 < text.length) {
            word += '"\\$`'.includes(next) ? next : next === "\n" ? "" : c + next;
            i += 2;
          } else if ((c === "$" && next === "(") || (!pwsh && c === "`")) {
            // A substitution inside double quotes still runs: its text is read as a line of its own.
            const start = c === "`" ? i + 1 : i + 2;
            let j = start;
            if (c === "`") {
              while (j < text.length && text[j] !== "`") j += 1;
            } else {
              let level = 1;
              while (j < text.length) {
                if (text[j] === "(") level += 1;
                else if (text[j] === ")") level -= 1;
                if (level === 0) break;
                j += 1;
              }
            }
            nested.push(text.slice(start, j));
            word += text.slice(i, Math.min(j + 1, text.length));
            i = j + 1;
          } else {
            word += c;
            i += 1;
          }
        }
        i += 1;
      } else if (ch === "$" && text[i + 1] === '"') {
        // `$"…"` (locale quoting) is a double-quoted word.
        i += 1;
      } else if (ch === "$" && text[i + 1] === "'") {
        // `$'…'` (ANSI-C quoting): the word is the quoted text with its escapes decoded, so `$'\x2df'` reads `-f`.
        let j = i + 2;
        while (j < text.length && text[j] !== "'") {
          const c = text[j] ?? "";
          const next = text[j + 1] ?? "";
          const code = /^(?:x[0-9A-Fa-f]{1,2}|u[0-9A-Fa-f]{1,4}|U[0-9A-Fa-f]{1,8}|[0-7]{1,3})/.exec(text.slice(j + 1, j + 10))?.[0];
          if (c !== "\\" || j + 1 >= text.length) {
            word += c;
            j += 1;
          } else if (ANSI_ESCAPES.has(next)) {
            word += ANSI_ESCAPES.get(next) ?? "";
            j += 2;
          } else if (code !== undefined) {
            const point = /^[0-7]/.test(code) ? Number.parseInt(code, 8) : Number.parseInt(code.slice(1), 16);
            word += point <= 0x10ffff ? String.fromCodePoint(point) : "�";
            j += 1 + code.length;
          } else if (next === "c" && j + 2 < text.length) {
            word += String.fromCharCode(text.charCodeAt(j + 2) & 0x1f);
            j += 3;
          } else {
            word += c + next;
            j += 2;
          }
        }
        inWord = true;
        i = j + 1;
      } else if (ch === (pwsh ? "`" : "\\")) {
        // The escape takes the next character as it is, a line break after it joining the lines.
        const next = text[i + 1];
        const crlf = next === "\r" && text[i + 2] === "\n";
        if (next !== undefined && next !== "\n" && !(pwsh && crlf)) {
          word += next;
          inWord = true;
        }
        i += pwsh && crlf ? 3 : 2;
      } else if ((ch === "$" && text[i + 1] === "(") || ch === "`" || (ch === "(" && (inWord || words.length > 0))) {
        // An unquoted substitution, or a group inside a command (PowerShell's `(…)`), is read as its own line and stays
        // a word, so the words after it are still this command's (pr/89). A group opening a command is cut below.
        const start = ch === "$" ? i + 2 : i + 1;
        let j = start;
        if (ch === "`") {
          while (j < text.length && text[j] !== "`") j += 1;
        } else {
          let level = 1;
          while (j < text.length) {
            if (text[j] === "(") level += 1;
            else if (text[j] === ")") level -= 1;
            if (level === 0) break;
            j += 1;
          }
        }
        nested.push(text.slice(start, j));
        word += text.slice(i, Math.min(j + 1, text.length));
        inWord = true;
        i = j + 1;
      } else if (ch === " " || ch === "\t") {
        endWord();
        i += 1;
      } else if (ch === "#" && !inWord) {
        while (i < text.length && text[i] !== "\n") i += 1;
      } else if (ch === ">" || ch === "<") {
        // A redirection: a file-descriptor number before it and its target after it are not arguments.
        if (inWord && /^\d+$/.test(word)) {
          word = "";
          inWord = false;
        } else endWord();
        while (i < text.length && "<>&|".includes(text[i] ?? "")) i += 1;
        dropNext = true;
      } else if (
        ";&|\n\r()`".includes(ch) ||
        (blocks && ch === "{" && !inWord) ||
        (blocks && ch === "}" && word.split("{").length <= word.split("}").length)
      ) {
        cut();
        i += 1;
      } else {
        word += ch;
        inWord = true;
        i += 1;
      }
    }
    cut();
    return { segments, nested };
  }

  /** Each assignment word the reading below skips (`X=v git …`, `env X=v …`), as it decoded it (review/208). */
  const assigned: string[] = [];

  /**
   * Each simple command's words, its program word first and normalized; `sh -c` and `eval` text read too. With `pwsh`,
   * the text is PowerShell's: a PowerShell command string or the Windows command interpreter's rest, whose backslash is
   * a plain character (review/194). A line nested past four levels throws a coded `NESTING_DEPTH` error (pr/58): the
   * reading stops there, so the guard refuses the line rather than allow what the fifth level runs.
   */
  function commandsOf(text: string, depth: number, pwsh: boolean): string[][] {
    if (depth > 4) throw Object.assign(new Error("nesting"), { code: "NESTING_DEPTH" });
    const { segments, nested } = splitLine(text, true, pwsh);
    // A PowerShell line is read with a POSIX shell's escapes too, and a line with a brace with its braces as words too
    // (review/185), so either reading adds denials and never lifts one: `git push origin x} -f` still forces.
    const commands: string[][] = pwsh ? commandsOf(text, depth, false) : [];
    for (const words of [...segments, ...(/[{}]/.test(text) ? splitLine(text, false, pwsh).segments : [])]) {
      let k = 0;
      let line: string | null = null;
      while (k < words.length && line === null) {
        const word = words[k] ?? "";
        let sub = k + 1;
        while (MANAGERS.has(programName(word)) && sub < words.length) {
          const option = words[sub] ?? "";
          const next = words[sub + 1] ?? "-";
          if (MANAGER_VALUED.has(option) || (programName(word) === "yarn" && option === "workspace")) sub += 2;
          // npm reads any `--<key> <value>` as a setting (`--loglevel silly`): a long option's next word is its value
          // unless it is an option or a runner's subcommand.
          else if (/^--[^=]+$/.test(option) && !next.startsWith("-") && !RUNNERS.has(`${programName(word)} ${next}`)) sub += 2;
          else if (option.startsWith("-") && option !== "--") sub += 1;
          else break;
        }
        const runner = `${programName(word)} ${words[sub] ?? ""}`;
        if (ASSIGNMENT.test(word) || KEYWORDS.has(word)) {
          if (ASSIGNMENT.test(word)) assigned.push(word);
          k += 1;
        } else if (WRAPPERS.has(programName(word)) || RUNNERS.has(runner)) {
          // A wrapper's options are skipped with their values, so `sudo -u root git …` reads `git` as the program.
          const [short, long, lineOptions] = RUNNERS.has(runner)
            ? RUNNER_OPTIONS
            : (WRAPPER_OPTIONS.get(programName(word)) ?? NO_OPTIONS);
          k = RUNNERS.has(runner) ? sub + 1 : k + 1;
          while (k < words.length) {
            const option = words[k] ?? "";
            if (ASSIGNMENT.test(option)) {
              assigned.push(option);
              k += 1;
              continue;
            }
            if (!/^(-|\d)/.test(option)) break;
            k += 1;
            if (option === "--") break;
            let value: string | undefined;
            let isLine = false;
            if (option.startsWith("--")) {
              const name = option.split("=")[0] ?? "";
              if (long.includes(name) || lineOptions.includes(name)) {
                isLine = lineOptions.includes(name);
                value = option.includes("=") ? option.slice(name.length + 1) : words[k];
                if (!option.includes("=")) k += 1;
              }
            } else if (option.startsWith("-")) {
              for (let c = 1; c < option.length; c += 1) {
                const letter = option[c] ?? "";
                if (!short.includes(letter) && !lineOptions.includes(`-${letter}`)) continue;
                isLine = lineOptions.includes(`-${letter}`);
                value = c === option.length - 1 ? words[k] : option.slice(c + 1);
                if (c === option.length - 1) k += 1;
                break;
              }
            }
            // An option whose value is a command line (`env -S '…'`, `npx -c '…'`): that line is what runs.
            if (isLine && value !== undefined) {
              line = [value, ...words.slice(k)].join(" ");
              break;
            }
          }
        } else break;
      }
      if (line !== null) {
        commands.push(...commandsOf(line, depth + 1, pwsh));
        continue;
      }
      const cmd = words.slice(k);
      if (cmd.length === 0) continue;
      // A program word holding a whole command line (`bun exec 'git push'`) is also read as that line, unless it is this one.
      if (/\s/.test(cmd[0] ?? "") && cmd.join(" ") !== text) commands.push(...commandsOf(cmd.join(" "), depth + 1, pwsh));
      cmd[0] = programName(cmd[0] ?? "");
      // git's dashed form (`git-push`, as git's exec path holds it) is git running that subcommand.
      if (/^git-./.test(cmd[0])) cmd.splice(0, 1, "git", cmd[0].slice(4));
      if (SHELLS.has(cmd[0] ?? "")) {
        const flag = cmd.findIndex((word, index) => index > 0 && /^-[A-Za-z]*c[A-Za-z]*$/.test(word));
        const script = flag === -1 ? undefined : cmd[flag + 1];
        if (script !== undefined) commands.push(...commandsOf(script, depth + 1, false));
      } else if (cmd[0] === "eval") {
        commands.push(...commandsOf(cmd.slice(1).join(" "), depth + 1, false));
      } else if (POWERSHELLS.has(cmd[0] ?? "")) {
        // PowerShell's command string (build/89): the words after `-Command`; with none, the words from the first one
        // that is no option, and each later word holding a blank, a quoted command past an option's value, each read
        // with PowerShell's escape (review/194).
        const at = cmd.findIndex((word, index) => index > 0 && commandFlag(word) !== null);
        const first = at !== -1 ? -1 : cmd.findIndex((word, index) => index > 0 && !/^-|^\/\w*$/.test(word));
        if (at !== -1) commands.push(...commandsOf([commandFlag(cmd[at] ?? ""), ...cmd.slice(at + 1)].join(" "), depth + 1, true));
        else if (first !== -1) commands.push(...commandsOf(cmd.slice(first).join(" "), depth + 1, true));
        for (const word of first === -1 ? [] : cmd.slice(first + 1)) if (/\s/.test(word)) commands.push(...commandsOf(word, depth + 1, true));
      } else if (cmd[0] === "cmd") {
        // The Windows command interpreter (review/183): the words after `/c` or `/k`, any letter case, a value attached,
        // read as PowerShell's are, a backslash being a plain character there too (review/194), and read with each
        // caret escape taken off as well (`g^it`, `--for^ce`, pr/10), so that reading only adds denials.
        const at = cmd.findIndex((word, index) => index > 0 && /^\/[ck]/i.test(word));
        const rest = at === -1 ? "" : [(cmd[at] ?? "").slice(2), ...cmd.slice(at + 1)].join(" ");
        if (at !== -1) commands.push(...commandsOf(rest, depth + 1, true));
        if (rest.includes("^")) commands.push(...commandsOf(rest.replace(/\^([\s\S])/g, "$1"), depth + 1, true));
      } else if (cmd[0] === "git") {
        // Lines a git builtin runs (review/184): each `git rebase --exec` or `-x` line (`--ex`, `--exe` and a cluster
        // as git's option parser reads them), and the command `git bisect run` runs, its words kept as words.
        const { sub, args } = gitParts(cmd);
        const rebase = sub === "rebase" ? args : [];
        for (let j = 0; j < rebase.length && rebase[j] !== "--"; j += 1) {
          const arg = rebase[j] ?? "";
          const long = /^--ex(?:ec?)?(=[\s\S]*)?$/.exec(arg);
          let exec: string | undefined;
          if (long !== null) exec = long[1] === undefined ? rebase[(j += 1)] : long[1].slice(1);
          else if (/^-[^-]/.test(arg)) {
            for (let c = 1; c < arg.length; c += 1) {
              const letter = arg[c] ?? "";
              if (letter === "x") exec = c === arg.length - 1 ? rebase[(j += 1)] : arg.slice(c + 1);
              if (letter === "x" || "sXCS".includes(letter)) {
                if (letter !== "x" && letter !== "S" && c === arg.length - 1) j += 1;
                break;
              }
            }
          }
          if (exec !== undefined) commands.push(...commandsOf(exec, depth + 1, false));
        }
        if (sub === "bisect" && args[0] === "run") {
          commands.push(...commandsOf(args.slice(1).map((word) => `'${word.replace(/'/g, "'\\''")}'`).join(" "), depth + 1, false));
        }
      }
      commands.push(cmd);
    }
    for (const inner of nested) commands.push(...commandsOf(inner, depth + 1, pwsh));
    return commands;
  }

  /** git's subcommand, its arguments and its `-c` pairs, the global options skipped. */
  function gitParts(cmd: string[]): { sub: string; args: string[]; config: string[] } {
    const config: string[] = [];
    let k = 1;
    while (k < cmd.length) {
      const word = cmd[k] ?? "";
      if (word === "-c") {
        config.push(cmd[k + 1] ?? "");
        k += 2;
      } else if (["-C", "--git-dir", "--work-tree", "--namespace", "--config-env", "--super-prefix"].includes(word)) {
        k += 2;
      } else if (word.startsWith("-")) {
        k += 1;
      } else break;
    }
    return { sub: (cmd[k] ?? "").toLowerCase(), args: cmd.slice(k + 1), config };
  }

  /**
   * gh's positional words, `-R`/`--repo` and its value skipped. Before the subcommand, as gh's parser reads it (pr/97),
   * an option with no `=` but help and version takes the next word: `gh pr --body x merge 1` merges.
   */
  function ghPositionals(cmd: string[]): string[] {
    const positionals: string[] = [];
    for (let k = 1; k < cmd.length; k += 1) {
      const word = cmd[k] ?? "";
      if (word === "-R" || word === "--repo") k += 1;
      else if (positionals.length < 2 && /^(?:--[^=]+|-[^-])$/.test(word) && !["-h", "--help", "--version"].includes(word)) k += 1;
      else if (!word.startsWith("-")) positionals.push(word);
    }
    return positionals;
  }

  /**
   * An HTTP call's method (the tool's default unless a flag or a body sets it), whether that is a write, and each
   * target's path below its repository or organisation (`repos/<o>/<r>/` cut), without scheme, host, query or a
   * trailing slash and with its percent-encoding decoded (build/76), read a second time with its dot segments resolved
   * (pr/93); the repository's own path stays whole. `next` is
   * the call after curl's `--next` (pr/72).
   */
  function httpCall(raw: string[]): { write: boolean; method: string; paths: string[]; cmd: string[]; next: string[] | null } {
    const tool = raw[0] ?? "";
    const hidden = (): never => {
      throw Object.assign(new Error("http target hidden"), { code: "HTTP_TARGET_HIDDEN" });
    };
    // wget reads a long option's unique prefix as the option (`--meth=DELETE`, `--post-d`, pr/11), and curl's 7.x line
    // does too (`--req DELETE`, `--dat '{}'`, pr/84): one of two letters or more (`--me`, pr/29) is expanded to the
    // method, body, `--execute`, `--config`, `--input-file`, `--next`, `--globoff` or `--url` option it begins, a full
    // name kept as it is, so a misread prefix only adds a denial. A prefix the tool finds ambiguous (wget's `--po`,
    // curl's `--dat`) is one it refuses, so reading it as the option over-reads a line that sends nothing into a denial.
    const LONG = new Map([
      ["wget", ["--method", "--post-data", "--post-file", "--body-data", "--body-file", "--execute", "--config", "--input-file"]],
      ["curl", ["--request", "--data", "--data-raw", "--data-binary", "--data-ascii", "--data-urlencode", "--json", "--form",
        "--form-string", "--upload-file", "--config", "--next", "--globoff", "--url"]],
    ]);
    const expanded = raw.map((word) => {
      const name = word.split("=")[0] ?? "";
      const full = /^--[a-z-]{2,}$/i.test(name) ? LONG.get(tool)?.find((option) => option.startsWith(name.toLowerCase())) : undefined;
      return full === undefined ? word : full + word.slice(name.length);
    });
    // wget runs `-e`/`--execute`'s value as a wgetrc command (pr/23), its name read regardless of case, `_` and `-`:
    // `method=<M>`, the four body commands and `input` become the option each sets, so the call is read as that option's.
    // Any other command stays a skipped value. A cluster ending in `e`, or with a command attached after its `e`, counts.
    const WGETRC = new Map([["method", "--method"], ["postdata", "--post-data"], ["postfile", "--post-file"],
      ["bodydata", "--body-data"], ["bodyfile", "--body-file"], ["input", "--input-file"]]);
    const cmd: string[] = [];
    for (let k = 0; k < expanded.length; k += 1) {
      const word = expanded[k] ?? "";
      // curl's body or method letter with its value attached, or a short cluster's first value letter (`-d@<file>`,
      // `-sd{…}`, `-sT f`, pr/81; `-sX$M`, pr/83), and gh's value letter after its one boolean, `-i`, its `=` aside as
      // gh reads it (`-iXDELETE`, `-X=PUT`), read apart: the letters before it, the letter, its value. A cluster whose
      // first value letter is another is read as no method and no body, the letters after it being its value (`-oX`,
      // `-od`), and wget has no short method or body letter.
      const lead =
        tool === "curl" ? /^-([^-:KHouAebcwmxrEdFTXCDPQtyYzU]*)([dFTX])([\s\S]*)$/.exec(word)
        : tool === "gh" ? /^-(i*)([XfFHpqt])=?([\s\S]*)$/.exec(word)
        : null;
      if (lead !== null && word.length > 2) {
        if (lead[1]) cmd.push(`-${lead[1]}`);
        cmd.push(`-${lead[2]}`);
        if (lead[3]) cmd.push(lead[3]);
        continue;
      }
      const own = /^(-[A-Za-z]*e|--execute)$/.test(word);
      let rc: string | undefined;
      if (tool === "wget" && k > 0) {
        if (own) rc = expanded[k + 1];
        else if (word.startsWith("--execute=")) rc = word.slice(10);
        else rc = /^-[A-Za-z]*?e(.+)$/.exec(word)?.[1];
      }
      const eq = rc?.indexOf("=") ?? -1;
      const option = rc !== undefined && eq > 0 ? WGETRC.get(rc.slice(0, eq).trim().toLowerCase().replace(/[-_]/g, "")) : undefined;
      if (rc === undefined || option === undefined) cmd.push(word);
      else {
        cmd.push(`${option}=${rc.slice(eq + 1).trim()}`);
        if (own) k += 1;
      }
    }
    let method: string | null = null;
    let body = false;
    let globoff = false;
    let inputFile = false;
    let end = cmd.length;
    let next: string[] | null = null;
    const targets: string[] = [];
    // gh's options before `api` are the call's too (pr/97).
    const api = tool === "gh" ? cmd.indexOf("api") : -1;
    const valueFlags =
      tool === "gh"
        ? ["-H", "--header", "-q", "--jq", "-t", "--template", "--hostname", "-p", "--preview", "--cache"]
        : ["-H", "--header", "-o", "--output", "-u", "--user", "-A", "--user-agent", "-e", "--referer", "-b", "--cookie",
           "-c", "--cookie-jar", "-w", "--write-out", "-m", "--max-time", "-x", "--proxy", "-K", "--config", "-r",
           "--range", "-E", "--cert", "--key", "--cacert", "--oauth2-bearer", "--connect-timeout", "--retry",
           "-O", "--output-document", "--password"];
    const bodyFlags =
      tool === "gh"
        ? ["-f", "-F", "--field", "--raw-field", "--input"]
        : ["-d", "--data", "--data-raw", "--data-binary", "--data-urlencode", "--data-ascii", "--json", "-F", "--form",
           "--form-string", "-T", "--upload-file", "--post-data", "--post-file", "--body-data", "--body-file"];
    for (let k = 1; k < cmd.length; k += 1) {
      if (k === api) continue;
      const word = cmd[k] ?? "";
      const name = word.split("=")[0] ?? "";
      if (tool === "curl" && (word === "--next" || word === "-:")) {
        next = ["curl", ...cmd.slice(k + 1)];
        end = k;
        break;
      }
      if (tool !== "gh" && /^--conf(ig?)?(=|$)/.test(word)) hidden();
      if (tool === "wget" && /^--input-file(=|$)/.test(word)) inputFile = true;
      if (tool !== "gh" && /^-[^-]/.test(word)) {
        // A cluster's letters up to the first that takes a value.
        for (const letter of word.slice(1)) {
          if (tool === "curl") {
            if (letter === "K" || letter === ":") hidden();
            if (letter === "g") globoff = true;
            if ("HouAebcwmxrEdFTXCDPQtyYzU".includes(letter)) break;
          } else {
            if (letter === "i") inputFile = true;
            if ("oaeiBtOTwQPlARDXIU".includes(letter)) break;
          }
        }
      }
      if (tool === "curl" && word === "--globoff") globoff = true;
      // wget's `-X` is `--exclude-directories` (pr/90).
      const methodLetter = tool !== "wget";
      if ((word === "-X" && methodLetter) || word === "--method" || word === "--request") {
        // A method word the line ends before is one it cannot show (pr/83).
        method = cmd[k + 1] ?? hidden();
        k += 1;
      } else if (name === "--method" || name === "--request") {
        method = word.slice(name.length + 1);
      } else if (/^-X./.test(word) && methodLetter) {
        method = word.slice(2);
      } else if (word === "-X") {
        k += 1;
      } else if (bodyFlags.includes(word)) {
        body = true;
        k += 1;
      } else if (word.includes("=") && bodyFlags.includes(name)) {
        body = true;
      } else if (word === "--url") {
        targets.push(cmd[k + 1] ?? "");
        k += 1;
      } else if (valueFlags.includes(word)) {
        k += 1;
      } else if (/^-[fF]./.test(word) && tool === "gh") {
        body = true;
      } else if (!word.startsWith("-")) {
        targets.push(word);
      }
    }
    const verb = (method ?? (body ? "POST" : "GET")).toUpperCase();
    const write = ["POST", "PUT", "PATCH", "DELETE"].includes(verb);
    // A method the line cannot show (pr/83), a target curl's globbing expands (pr/76), targets in wget's input file (pr/77).
    if (method !== null && /[$`]/.test(method)) hidden();
    if (tool === "curl" && (write || body) && !globoff && targets.some((target) => /[{[]/.test(target))) hidden();
    if (tool === "wget" && write && inputFile) hidden();
    // Each target read twice (pr/93): as written, and with its dot segments resolved (RFC 3986 §5.2.4), as curl sends
    // it unless `--path-as-is` is set, `api/v3/` cut again from the resolved one. A rule matching either denies, so the
    // second reading only adds denials, whatever the tool does with the segments.
    const resolved = (path: string): string => {
      const segments = path.split("/");
      const kept: string[] = [];
      segments.forEach((segment, index) => {
        if (segment === "..") kept.pop();
        else if (segment !== ".") kept.push(segment);
        if ((segment === "." || segment === "..") && index === segments.length - 1) kept.push("");
      });
      return kept.join("/").replace(/^\/+/, "").replace(/^api\/v3\//i, "");
    };
    const paths = targets.flatMap((target) => {
      const decoded = (target
        .replace(/^[A-Za-z][A-Za-z0-9+.-]*:\/\/[^/]*/, "")
        .replace(/^[\w-]+(\.[\w-]+)+(:\d+)?(?=\/)/, "")
        .replace(/^\/+/, "")
        .replace(/^api\/v3\//i, "")
        .split(/[?#]/)[0] ?? "")
        .replace(/%([0-9A-Fa-f]{2})/g, (_, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)));
      return [...new Set([decoded, resolved(decoded)])].map((path) =>
        path
          // A trailing slash dropped first, so the bare repository path stays `repos/<o>/<r>` (or `repositories/<id>`).
          .replace(/\/+$/, "")
          .replace(/^repos\/[^/]+\/[^/]+\//i, "")
          .replace(/^(orgs|enterprises|users|repositories)\/[^/]+\//i, ""),
      );
    });
    return { write, method: verb, paths, cmd: cmd.slice(0, end), next };
  }
  // </shell-reading>

  const deny = (what: string): UnattendedPushVerdict => ({
    deny: true,
    reason:
      `${what} while this run is unattended: an unattended run pushes only through ` +
      `\`stamity run checkpoint\` and \`stamity run end\`, which hold the person-only paths and scan for ` +
      `secrets first (REQ-FLOW-120).`,
  });
  // Each path is read below `repos/<o>/<r>/` (see `httpCall`).
  const MOVES = [
    /^pulls\/?$/i,
    /^pulls\/[^/]+\/?$/i,
    /^pulls\/[^/]+\/(merge|update-branch)\/?$/i,
    /^contents(\/|$)/i,
    /^git\/(refs|commits|trees|blobs|tags)(\/|$)/i,
    /^(merges|merge-upstream)\/?$/i,
    /^branches\/.+\/rename\/?$/i,
  ];
  const GRAPHQL_MOVES =
    /\b(createPullRequest|updatePullRequest|updatePullRequestBranch|createCommitOnBranch|createRef|updateRef|updateRefs|deleteRef|mergeBranch|mergePullRequest|enablePullRequestAutoMerge|enqueuePullRequest)\b/;
  /**
   * gh's built-in top-level commands (`gh help`, gh 2.102.0), its hidden `help` and `version`, and its default alias
   * `co` (pr/56). Any other group is an alias, which expands to any gh command (`gh land` for `pr merge`), or an
   * extension, so the line does not show what it runs. gh's own aliases of its built-ins follow, each the ALIASES of
   * `gh <group> --help` (pr/67): `agent-tasks`, `agent` and `agents` of agent-task, `at` of attestation, `cs` of
   * codespace, `extensions` and `ext` of extension, `rs` of ruleset, `skills` of skill.
   */
  const GH_BUILTINS = new Set(
    ("agent-task alias api attestation auth browse cache co codespace completion config copilot discussion extension " +
      "gist gpg-key help issue label licenses org pr preview project release repo ruleset run search secret skill " +
      "ssh-key status variable version workflow " +
      "agent-tasks agent agents at cs extensions ext rs skills").split(" "),
  );
  /** git's builtins (`git --list-cmds=builtins`, git 2.52.0), and `subtree`, which this verdict reads. */
  const GIT_BUILTINS = new Set(
    ("add am annotate apply archive backfill bisect blame branch bugreport bundle cat-file check-attr check-ignore " +
      "check-mailmap check-ref-format checkout checkout--worker checkout-index cherry cherry-pick clean clone column " +
      "commit commit-graph commit-tree config count-objects credential credential-cache credential-cache--daemon " +
      "credential-store describe diagnose diff diff-files diff-index diff-pairs diff-tree difftool fast-export " +
      "fast-import fetch fetch-pack fmt-merge-msg for-each-ref for-each-repo format-patch fsck fsck-objects " +
      "fsmonitor--daemon gc get-tar-commit-id grep hash-object help hook index-pack init init-db interpret-trailers " +
      "last-modified log ls-files ls-remote ls-tree mailinfo mailsplit maintenance merge merge-base merge-file " +
      "merge-index merge-ours merge-recursive merge-recursive-ours merge-recursive-theirs merge-subtree merge-tree " +
      "mktag mktree multi-pack-index mv name-rev notes pack-objects pack-redundant pack-refs patch-id pickaxe prune " +
      "prune-packed pull push range-diff read-tree rebase receive-pack reflog refs remote remote-ext remote-fd repack " +
      "replace replay repo rerere reset restore rev-list rev-parse revert rm send-pack shortlog show show-branch " +
      "show-index show-ref sparse-checkout stage stash status stripspace submodule--helper switch symbolic-ref tag " +
      "unpack-file unpack-objects update-index update-ref update-server-info upload-archive upload-archive--writer " +
      "upload-pack var verify-commit verify-pack verify-tag version whatchanged worktree write-tree subtree").split(" "),
  );
  /** The read and setup forms of two subcommands that are no builtins, the only ones of theirs that pass (review/187). */
  const READ_FORMS = new Map([
    ["lfs", new Set(["fetch", "pull", "install", "ls-files", "env", "status"])],
    ["submodule", new Set(["status", "init", "update", "sync"])],
  ]);
  /** The configuration keys an unattended git call may set on its line: display and identity keys only. */
  const CONFIG_KEYS = /^(?:color\..+|advice\..+|core\.quotepath|init\.defaultbranch|user\.name|user\.email)$/i;
  /**
   * The names of the variables through which git reads configuration from the environment: the pairs (review/221) and
   * the files git reads in place of the global and system ones (review/233); a pair's number the line computes
   * (`GIT_CONFIG_KEY_$i`) and a name the line builds from the prefix (`GIT_CONFIG_$v`) among them.
   */
  const CONFIG_NAMES = "GIT_CONFIG_(?:(?:COUNT|PARAMETERS|GLOBAL|SYSTEM)\\b|(?:KEY|VALUE)_\\d*\\b|(?=[$`{(%]))";
  /**
   * One of those names in the line's text or in a word as the reading decoded it (review/221), whatever form sets it
   * (review/227, review/196): an assignment, PowerShell's `$env:` and `${env:…}`, `Set-Item env:…`, `New-Item env:…`,
   * `[Environment]::SetEnvironmentVariable`, `export` or `declare -x` of a name set earlier.
   */
  const CONFIG_ENVIRONMENT = new RegExp(`\\b${CONFIG_NAMES}`, "i");
  /**
   * git's environment variables whose value is a program git runs (review/208): twins of the `-c` keys refused below;
   * and `SSH_ASKPASS`, which git runs when no askpass helper is set, as the ssh it starts does (v0b).
   */
  const PROGRAM_VARIABLES =
    "GIT_EDITOR|GIT_SEQUENCE_EDITOR|GIT_SSH_COMMAND|GIT_SSH|GIT_EXTERNAL_DIFF|GIT_ASKPASS|GIT_PAGER|GIT_PROXY_COMMAND|GIT_EXEC_PATH|SSH_ASKPASS";
  /** A program-valued or configuration variable's name, as a word starts with it: the set the line-wide rule reads. */
  const GIT_VARIABLE = `(?:(?:${PROGRAM_VARIABLES})\\b|${CONFIG_NAMES})`;
  /**
   * A word, as the reading decoded it, that sets one (review/231): an assignment before a program or after a wrapper,
   * and an operand of `export`, `declare`, `typeset`, `local` or the Windows command interpreter's `set`.
   */
  const SETS_WORD = new RegExp(`^${GIT_VARIABLE}`, "i");
  const SETTERS = new Set(["export", "declare", "typeset", "local", "set"]);
  /**
   * An option word of `declare`, `typeset` or `local` whose cluster carries `x` (`-x`, `-gx`, `-rx`, `-xr`), read
   * wherever it stands on the command, before or after `--` (review/243): the command exports its operands as `export`
   * does, so a name with no `=` is set too, its value from an earlier `read`, `for` or `printf -v`.
   */
  const EXPORTS = /^-[A-Za-z]*x[A-Za-z]*$/;
  const EXPORTERS = new Set(["declare", "typeset", "local"]);
  /**
   * The forms that assign a name with no `=` (review/247): `read` (any of its names, `-a`'s among them), `mapfile`,
   * `readarray` and `getopts` (any operand, the safe direction), the names of `for NAME in`, the name `printf -v` takes.
   * Under allexport, or with the name already in the environment, what the line starts sees the value.
   */
  const READERS = new Set(["read", "mapfile", "readarray", "getopts"]);
  function assignsNoValue(cmd: string[]): string[] {
    const program = cmd[0] ?? "";
    if (READERS.has(program)) return cmd.slice(1);
    if (program === "for") return cmd.slice(1, cmd.includes("in") ? cmd.indexOf("in") : undefined);
    if (program !== "printf") return [];
    return cmd.flatMap((word, index) => (word === "-v" ? [cmd[index + 1] ?? ""] : /^-v./.test(word) ? [word.slice(2)] : []));
  }
  /**
   * allexport turned on (review/247), which exports every name a later command sets: a `set` cluster carrying `a`
   * (`+a` turns it off), or the option by name to `set -o`, zsh's `setopt` or `unsetopt`, or bash's `shopt -o`, as zsh
   * reads it (any case, any `_`), its `no` form too (the safe direction).
   */
  const ALLEXPORT_CLUSTER = /^-[A-Za-z]*a[A-Za-z]*$/;
  const OPTION_SETTERS = new Set(["set", "setopt", "unsetopt", "shopt"]);
  /** One of git's program or configuration variables named anywhere in a text or a word. */
  const NAMES_VARIABLE = new RegExp(`\\b${GIT_VARIABLE}`, "i");
  /**
   * PowerShell's spellings that set one, in the line's text (review/231): `$env:NAME =` and `${env:NAME} =` (a compound
   * assignment among them), `Set-Item` or `New-Item` (`si`, `ni`) on `env:NAME`, `[Environment]::SetEnvironmentVariable`.
   */
  const SETS_TEXT = new RegExp(
    `\\$\\{?env:${GIT_VARIABLE}\\}?\\s*(?:[-+*/%]|\\?\\?)?=|` +
      `\\b(?:Set-Item|New-Item|si|ni)\\b[^;|&\\n]*?(?<![\\w$\\{])env:\\\\?${GIT_VARIABLE}|` +
      `\\[(?:System\\.)?Environment\\]::SetEnvironmentVariable\\(\\s*['"]${GIT_VARIABLE}`,
    "i",
  );
  /** A word, as the reading decoded it, assigning one: before a program, after `env` or `sudo`, after `export`. */
  const PROGRAM_WORD = new RegExp(`^(?:${PROGRAM_VARIABLES})=`, "i");
  /** The line's own text assigning one, PowerShell's `$env:` and `${env:…}` among the spellings. */
  const PROGRAM_TEXT = new RegExp(`\\b(?:${PROGRAM_VARIABLES})\\}?\\s*=`, "i");
  /** `git remote`'s writes (review/209): each changes what a remote, the run verbs' `origin` among them, names. */
  const REMOTE_WRITES = new Set(["add", "set-url", "rename", "remove", "rm", "set-head", "set-branches"]);

  /**
   * Whether a `git config` call writes a `remote.*` key or section (review/209), or a `url.*` one, whose `insteadOf`
   * and `pushInsteadOf` rewrite where a remote fetches and pushes (review/220): a set, an add, an unset, a section
   * renamed or removed, in the option forms or the subcommands, and an edit of the file, which can write any key.
   */
  function writesRemote(args: string[]): boolean {
    const positionals: string[] = [];
    let write = false;
    let read = false;
    let edit = false;
    let rename = false;
    for (let j = 0; j < args.length; j += 1) {
      const arg = args[j] ?? "";
      const name = (arg.split("=")[0] ?? "").toLowerCase();
      if (arg === "--") {
        positionals.push(...args.slice(j + 1));
        break;
      }
      if (["--add", "--replace-all", "--unset", "--unset-all", "--rename-section", "--remove-section"].includes(name)) {
        write = true;
        rename ||= name === "--rename-section";
      } else if (name === "--edit") edit = true;
      else if (["--get", "--get-all", "--get-regexp", "--get-urlmatch", "--get-color", "--get-colorbool", "--list"].includes(name)) {
        read = true;
      } else if (["--file", "--blob", "--type", "--value", "--comment", "--default", "--url"].includes(name)) {
        if (!arg.includes("=")) j += 1;
      } else if (/^-[^-]/.test(arg)) {
        // A short cluster: `-e` edits, `-l` lists, and `-f` or `-t` takes the rest, or the next word, as its value.
        for (let c = 1; c < arg.length; c += 1) {
          const letter = arg[c] ?? "";
          if (letter === "e") edit = true;
          if (letter === "l") read = true;
          if (letter === "f" || letter === "t") {
            if (c === arg.length - 1) j += 1;
            break;
          }
        }
      } else if (!arg.startsWith("-")) positionals.push(arg);
    }
    const first = (positionals[0] ?? "").toLowerCase();
    const sub = ["get", "list", "set", "unset", "rename-section", "remove-section", "edit"].includes(first) ? first : "";
    if (edit || sub === "edit") return true;
    const rest = sub === "" ? positionals : positionals.slice(1);
    const keys = rest.slice(0, rename || sub === "rename-section" ? 2 : 1);
    const writes = write || ["set", "unset", "rename-section", "remove-section"].includes(sub) || (sub === "" && !read && rest.length > 1);
    return writes && keys.some((key) => /^(?:remote|url)(\.|$)/i.test(key));
  }

  /**
   * The run verbs, and a text naming one beside the package: either bin `package.json` declares (`stamity`, and `st` as
   * a word, review/93), the CLI file, a pinned `@<semver>`. The verb follows `run` directly, or after option words and
   * their values that open on a dash and hold no `;`, `|`, `&` or line break (review/130).
   */
  const RUN_VERBS = new Set(["start", "checkpoint", "end"]);
  const PACKAGE = /stamity|\bst\b|\bcli\.m?js\b|@\d+\.\d+\.\d+/i;
  const namesVerb = (text: string): boolean =>
    /\brun(?:\W+|[^\w\s]*\s+[^\w\s-]*-[^;|&\r\n]*?\W)(?:start|checkpoint|end)\b/i.test(text) && PACKAGE.test(text);
  /**
   * The same over one parsed command's decoded words, joined (review/130, round 3), for a form the parse does not
   * normalize (the CLI file started by `node`, a launcher it does not unwrap). Inside one simple command a separator
   * sits only in a quoted word, so none ends the option words; the decoding reads an escaped or quoted dash as a dash.
   * A first word after `run` whose value the reading cannot settle (an expansion, a glob, a brace or a splat) may be an
   * option word, so it opens them too: unsure is refused. The first `run` that opens option words decides, since any
   * verb after a later one is after it too.
   */
  const namesVerbInWords = (words: readonly string[]): boolean => {
    const text = words.join(" ");
    if (!PACKAGE.test(text)) return false;
    for (const open of text.matchAll(/\brun[^\w\s]*\s+([^\w\s]*)/gi)) {
      const rest = text.slice((open.index ?? 0) + open[0].length);
      if (/^(?:start|checkpoint|end)\b/i.test(rest)) return true;
      if (/[-$`@*?[{]/.test(open[1] ?? "")) return /(?:^|\W)(?:start|checkpoint|end)\b/i.test(rest);
    }
    return false;
  };
  /** npm's per-scope registry URL, as `REGISTRY_URL` in `src/shared/cliCall.ts` reads one. */
  const REGISTRY_URL = /^https:\/\/[A-Za-z0-9.-]+(?::(?:[1-9]\d{0,3}|[1-5]\d{4}|6[0-4]\d{3}|65[0-4]\d{2}|655[0-2]\d|6553[0-5]))?(?:\/[A-Za-z0-9._~/-]*)?$/;
  /** A pinned package: a runnable npm name, then `@` and a semver-shaped version (`src/shared/cliCall.ts`). */
  const PINNED_PACKAGE =
    /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*@(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

  /**
   * What keeps a run verb's line from being the one simple command it must be (REQ-FLOW-121), or null when it is that
   * command: `stamity` or `st`, or `npx` with one of `-y`, `--yes`, `--no` or `--no-yes`, an optional
   * `--@<scope>:registry=<url>` and then `stamity` or `<pkg>@<semver>`; then `run <verb>` and literal words, at most one
   * closing `2>&1`. Single quotes are literal; double quotes hold no `$`, backtick or backslash; nothing else on the
   * line expands, redirects, joins or nests a command. With `powershell` the same, and no typographic quote, which
   * PowerShell reads as a quote, no blank but a space or a tab, no stop-parsing `--%` (its dashes typographic too), and
   * no unquoted `@` after the program, which PowerShell reads as a splat (review/131).
   */
  function verbShape(line: string): string | null {
    const text = line.replace(/[ \t]+2>&1[ \t]*$/, "");
    if (/[\r\n]/.test(text)) return "a line break";
    // Anywhere, inside a quote too: PowerShell closes a `'` with a typographic one (U+2018 to U+201E).
    const typographic = [...text].some((ch) => ch.charCodeAt(0) >= 0x2018 && ch.charCodeAt(0) <= 0x201e);
    if (powershell && typographic) return "a typographic quote, which PowerShell reads as a quote";
    // PowerShell splits words on more blanks than the two this reading splits on (review/131).
    if (powershell && /[^\S \t]|\u0085/.test(text)) return "a blank other than a space or a tab, which PowerShell splits words on";
    const words: string[] = [];
    /** The index of each word holding an unquoted `@`. */
    const ats: number[] = [];
    let word: string | null = null;
    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i] ?? "";
      if (ch === "'" || ch === '"') {
        const close = text.indexOf(ch, i + 1);
        if (close === -1) return "a quote left open";
        const quoted = text.slice(i + 1, close);
        if (ch === '"' && /[$`\\]/.test(quoted)) return "a `$`, backtick or backslash inside double quotes";
        word = (word ?? "") + quoted;
        i = close;
      } else if (ch === " " || ch === "\t") {
        if (word !== null) words.push(word);
        word = null;
      } else if ("$`\\(){};|&<>#".includes(ch)) {
        return ch === "`" ? "an unquoted backtick" : `an unquoted \`${ch}\``;
      } else {
        if (ch === "@") ats.push(words.length);
        word = (word ?? "") + ch;
      }
    }
    if (word !== null) words.push(word);
    // PowerShell reads an en dash, an em dash and a horizontal bar as `-`.
    if (powershell && words.some((each) => /^[-–-―]{2}%$/.test(each))) return "PowerShell's stop-parsing `--%`";
    let at = 1;
    if (words[0] === "npx") {
      if (!["-y", "--yes", "--no", "--no-yes"].includes(words[1] ?? "")) return "an `npx` call whose first word is not `-y`, `--yes`, `--no` or `--no-yes`";
      at = 2;
      const registry = /^--@[a-z0-9][a-z0-9._~-]*:registry=([\s\S]*)$/.exec(words[at] ?? "");
      if (registry !== null && !REGISTRY_URL.test(registry[1] ?? "")) return "a scope registry that is not a plain https URL";
      if (registry !== null) at += 1;
      const spec = words[at] ?? "";
      if (spec !== "stamity" && !PINNED_PACKAGE.test(spec)) return "an `npx` option or package other than `stamity` or `<pkg>@<semver>`";
      at += 1;
    } else if (words[0] !== "stamity" && words[0] !== "st") {
      return "a first word other than `stamity`, `st` or `npx`: a prefix, a wrapper or another program";
    }
    if (words[at] !== "run") return "words between the program and `run <verb>`";
    if (!RUN_VERBS.has(words[at + 1] ?? "")) return "words between `run` and its verb";
    // The program, the npx flag, the registry and the package are pinned above, so only the option words can splat.
    if (powershell && ats.some((index) => index > at)) return "an unquoted `@` after the program, which PowerShell reads as a splat";
    return null;
  }

  const commands = commandsOf(command, 0, powershell);
  for (const cmd of commands) {
    const program = cmd[0] ?? "";
    if (program === "git") {
      const { sub, args, config } = gitParts(cmd);
      if (sub === "push" || sub === "send-pack") return deny(`A raw \`git ${sub}\``);
      // `git subtree push` runs `git push` itself.
      const valued = new Set(["-P", "--prefix", "-m", "--message", "-b", "--branch", "--onto"]);
      const first = args.find((word, index) => !word.startsWith("-") && !valued.has(args[index - 1] ?? ""));
      if (sub === "subtree" && first === "push") return deny("A `git subtree push`");
      // An alias, defined on the line or in the configuration, and a computed subcommand can run a push the line
      // does not show (u21's review, the 01:50Z sign-off): unattended, git runs only a builtin this verdict knows.
      if (config.some((pair) => /^alias\./i.test(pair))) return deny("A git call defining an alias (`-c alias.<name>=…`)");
      // A configuration value git runs as a line (`core.fsmonitor`, `core.sshCommand`, …) runs whatever it names, so
      // unattended a git call sets only display and identity keys (the 02:31Z sign-off): a `-c` pair, or a
      // `--config-env` one, outside CONFIG_KEYS is refused, and so is any git call on a line that names git's
      // configuration variables, wherever on the line and in whatever form sets them, since the text cannot always
      // settle the order or the form, as the text spells it or as the reading decodes it (a quoted or escaped word,
      // review/221; a PowerShell spelling, review/227); a commit message naming one is refused with them.
      const globals = cmd.slice(1, cmd.length - args.length - 1);
      const configEnv = globals.flatMap((word, index) =>
        word === "--config-env" ? [globals[index + 1] ?? ""] : word.startsWith("--config-env=") ? [word.slice(13)] : [],
      );
      if ([...config, ...configEnv].some((pair) => !CONFIG_KEYS.test((pair.split("=")[0] ?? "").trim()))) {
        return deny("A git call setting a configuration key outside the display and identity keys (`-c <key>=…`)");
      }
      if (CONFIG_ENVIRONMENT.test(command) || [...assigned, ...commands.flat()].some((word) => CONFIG_ENVIRONMENT.test(word))) {
        return deny("A git call on a line that names git's configuration variables (`GIT_CONFIG_COUNT`, `GIT_CONFIG_KEY_<n>`, `GIT_CONFIG_VALUE_<n>`, `GIT_CONFIG_PARAMETERS`, `GIT_CONFIG_GLOBAL`, `GIT_CONFIG_SYSTEM`)");
      }
      // The environment twins of those keys (review/208): a variable whose value git runs as a program, set anywhere on
      // the line, as the reading decodes it (a quoted or escaped word, after a wrapper, inside a nested line) or as
      // the text spells it (`export`, PowerShell's `$env:`).
      if (PROGRAM_TEXT.test(command) || [...assigned, ...commands.flat()].some((word) => PROGRAM_WORD.test(word))) {
        return deny("A git call on a line that sets a program git runs through the environment (`GIT_EDITOR`, `GIT_SSH_COMMAND`, `GIT_EXEC_PATH`, …)");
      }
      // A remote repointed mid-run sends the run verbs' push somewhere the pre-flight never proved (review/209).
      const remoteForm = sub === "remote" ? (args.find((word) => !word.startsWith("-")) ?? "").toLowerCase() : "";
      if (REMOTE_WRITES.has(remoteForm)) return deny(`A \`git remote ${remoteForm}\`, a write of a remote`);
      if (sub === "config" && writesRemote(args)) return deny("A `git config` write of a `remote.*` or `url.*` key");
      // `git lfs` and `git submodule` pass in their read and setup forms; any other of theirs (`lfs push`,
      // `submodule foreach`, which runs a line) is refused as an unknown subcommand is (review/187).
      const forms = READ_FORMS.get(sub);
      if (forms !== undefined) {
        const form = (args.find((word) => !word.startsWith("-")) ?? "").toLowerCase();
        if (!forms.has(form)) return deny(`A \`git ${sub}\` subcommand outside its read and setup forms`);
        continue;
      }
      if (sub !== "" && !GIT_BUILTINS.has(sub)) return deny("A git subcommand that is not a builtin this guard knows");
      continue;
    }
    let http = program === "curl" || program === "wget";
    if (program === "gh") {
      const [group, sub] = ghPositionals(cmd);
      // Unattended, gh runs only a built-in this verdict knows, and defines no alias (pr/56).
      if (group !== undefined && !GH_BUILTINS.has(group)) return deny("A gh command that is not a built-in this guard knows (an alias or an extension)");
      if (group === "alias" && (sub === "set" || sub === "import")) return deny(`\`gh alias ${sub}\`, which defines an alias`);
      // An installed extension run through the built-in group runs what the line does not show (pr/64).
      if (["extension", "extensions", "ext"].includes(group ?? "") && sub === "exec") return deny(`\`gh ${group} exec\`, which runs an extension`);
      // Closing and reopening are the REST twin's `PATCH pulls/<n>` (review/213), `update-branch` its `PUT
      // pulls/<n>/update-branch` (review/232).
      if (group === "pr" && ["create", "new", "edit", "close", "reopen", "update-branch"].includes(sub ?? "")) return deny(`\`gh pr ${sub}\``);
      if (group === "repo" && sub === "sync") return deny("`gh repo sync`");
      // `gh repo create --source <dir> --push` runs `git push` itself, as `repo sync` does (review/109); `new` is gh's
      // alias for `create` (review/129).
      if (group === "repo" && (sub === "create" || sub === "new") && cmd.some((word) => /^--push(=|$)/.test(word))) {
        return deny(`\`gh repo ${sub} --push\``);
      }
      http = group === "api";
    }
    if (!http) continue;
    // Each of curl's requests alone (pr/72).
    for (let words: string[] | null = cmd; words !== null; ) {
      const { write, method, paths, cmd: part, next } = httpCall(words);
      for (const path of paths) {
        if (/^graphql$/i.test(path)) {
          if (GRAPHQL_MOVES.test(part.join(" "))) return deny("A GraphQL mutation that moves a branch or a pull request");
        } else if (write && MOVES.some((pattern) => pattern.test(path))) {
          return deny(`A REST write that moves a branch or a pull request (${method} ${path})`);
        }
      }
      words = next;
    }
  }
  // Whatever program the line runs (review/231): one of those variables set on it reaches what that program starts,
  // the run verbs' own git among them (`GIT_EXEC_PATH=<folder> stamity run end`). A line that only names one passes,
  // unless it turns allexport on (review/247): then any name the line sets is exported, however it is set.
  const allexport = commands.some(
    (cmd) =>
      (cmd[0] === "set" && cmd.slice(1).some((word) => ALLEXPORT_CLUSTER.test(word))) ||
      (OPTION_SETTERS.has(cmd[0] ?? "") && cmd.slice(1).some((word) => /^(?:no)?allexport$/.test(word.replace(/_/g, "").toLowerCase()))),
  );
  if (
    assigned.some((word) => SETS_WORD.test(word)) ||
    commands.some((cmd) => {
      const exports = cmd[0] === "export" || (EXPORTERS.has(cmd[0] ?? "") && cmd.slice(1).some((word) => EXPORTS.test(word)));
      if (assignsNoValue(cmd).some((word) => SETS_WORD.test(word))) return true;
      return SETTERS.has(cmd[0] ?? "") && cmd.slice(1).some((word) => SETS_WORD.test(word) && (exports || word.includes("=")));
    }) ||
    SETS_TEXT.test(command) ||
    (allexport && (NAMES_VARIABLE.test(command) || [...assigned, ...commands.flat()].some((word) => NAMES_VARIABLE.test(word))))
  ) {
    return deny("A line that sets one of git's program or configuration variables (`GIT_EXEC_PATH`, `GIT_EDITOR`, `GIT_CONFIG_COUNT`, …), which the run verbs' own git reads,");
  }
  // A run verb alone on its line (REQ-FLOW-121): a parsed command at any depth running one, or, for what the reading
  // cannot show, the text or a decoded word naming one beside the package. Any form that sets the verb's environment
  // (a setter, allexport, a wrapper, a nested shell, PowerShell's `env:` drive) needs more on the line than the verb.
  // commander takes `run`'s options before its subcommand, and a valued option's value is a word of its own, so the
  // verb is any word after `run` (review/130); the program's own options take no value. A form the parse does not
  // normalize is read over its decoded words, joined, and the raw text stays the backstop for what the parse cannot read.
  const runsVerb =
    commands.some((cmd) => {
      const at = cmd.findIndex((word, index) => index > 0 && !word.startsWith("-"));
      return (cmd[0] === "stamity" || cmd[0] === "st") && cmd[at] === "run" && cmd.slice(at + 1).some((word) => RUN_VERBS.has(word));
    }) ||
    [...commands, ...assigned.map((word) => [word])].some(namesVerbInWords) ||
    namesVerb(command) ||
    [...assigned, ...commands.flat()].some(namesVerb);
  const broke = runsVerb ? verbShape(command) : null;
  if (broke !== null) {
    return deny(`A run verb (\`stamity run start\`, \`checkpoint\` or \`end\`) on a line that is more than the verb (${broke}; REQ-FLOW-121)`);
  }
  return { deny: false };
}
