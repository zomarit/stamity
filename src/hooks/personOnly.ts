/**
 * Person-only acts (REQ-FLOW-102) and the unattended push rule (REQ-FLOW-120):
 * the table the shell guard and Claude Code's deny rows share.
 *
 * **Person-only acts** are refused to the main thread on every client, attended
 * or not: a force push, a push of a tag or of the default branch (named, or
 * implied by a refspec-less push or `HEAD` while on it), a remote branch
 * deletion, a tag, a merge or a review approval, `gh pr ready`, a release, a publish, a secret,
 * variable, protection or ruleset write, a write to the repository itself (its
 * default branch, visibility or name, its deletion, archiving or transfer) and a branch
 * rename. {@link personOnlyVerdict} reads a
 * command line for them; {@link CLAUDE_DENY_ROWS} is the part a Claude Code
 * prefix rule can say, so the settings layer and the guard agree.
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
 * respelling the text hides — a git or shell alias, a computed `sh -c "$(…)"`,
 * a PowerShell `-EncodedCommand` or a line piped into `iex` or a shell,
 * a bare tag name the context's `tags` does not list, a repository's own push
 * configuration, a GraphQL mutation or a REST body read from a file where the
 * API's default is not the default branch — passes. The tests assert
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
  | "protection";

/** One person-only act: its rule id and what the person keeps. */
export interface PersonOnlyRule {
  readonly id: PersonOnlyRuleId;
  readonly act: string;
}

/** Every person-only act, one row per rule id {@link personOnlyVerdict} returns. */
export const PERSON_ONLY_RULES: readonly PersonOnlyRule[] = [
  {
    id: "force-push",
    act: "a force push (`-f`, `--force`, `--force-with-lease`, `--force-if-includes`, a `+` refspec, a forced REST or GraphQL ref update)",
  },
  {
    id: "push-default",
    act: "a push to the default branch, named, matched by a pattern refspec or implied by a refspec-less push or `HEAD` while on it, or a REST or GraphQL commit or merge onto it",
  },
  {
    id: "push-tags",
    act: "a push of tags (`--tags`, `--follow-tags`, `--mirror`, `--all`, `tag <name>`, a refspec naming a tag: `refs/tags/…`, `tags/…` or a local tag's bare name, a REST or GraphQL tag ref)",
  },
  {
    id: "push-delete",
    act: "a remote branch deletion (`--delete`, `-d`, a `:ref` refspec, `gh pr close --delete-branch`, a REST or GraphQL ref deletion)",
  },
  { id: "tag", act: "creating or deleting a tag (`git tag` beyond listing)" },
  {
    id: "pr-merge",
    act: "merging a pull request or approving a review of one (`gh pr merge`, `gh pr review --approve`, the REST or GraphQL merge, a REST or GraphQL review with the event `APPROVE`)",
  },
  { id: "pr-ready", act: "marking a pull request ready for review (`gh pr ready`)" },
  { id: "release", act: "creating, editing or deleting a release (`gh release` beyond list, view, download)" },
  { id: "publish", act: "publishing a package (`npm`, `pnpm`, `yarn`, `bun` publish)" },
  { id: "secrets", act: "writing a secret or a variable (`gh secret`, `gh variable` beyond list, their REST paths)" },
  {
    id: "protection",
    act: "writing branch protection or a ruleset, renaming a branch, or writing the repository itself (`gh repo edit --default-branch` or `--visibility`, `gh repo rename`, `gh repo delete`, `gh repo archive`, a transfer, a REST PATCH or DELETE on the repository)",
  },
];

/** A command's person-only verdict: allowed, or denied naming its rule. */
export type PersonOnlyVerdict = { deny: false } | { deny: true; rule: PersonOnlyRuleId; reason: string };

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
 * The person-only rows a Claude Code prefix rule expresses, for the settings'
 * `permissions.deny` (u20). A form the prefix cannot say (a bare `git tag
 * <name>`, an implied destination, a REST write) is the shell guard's alone,
 * and so is a push naming the default branch: a row ending in a branch name
 * (`git push origin main`) would also refuse a longer one (`main-feature`) if
 * the prefix matches as a raw string, so no row ends in a name;
 * every `Bash(…)` row's prefix is one {@link personOnlyVerdict} denies, so the two layers
 * never disagree on what is the person's.
 *
 * The last rows are the GitHub MCP server's merge, branch-write, review-submit,
 * pull-request-update and repository-delete tools, by name, in
 * Claude Code's MCP rule form (`mcp__<server>__<tool>`, the server under the `github` key
 * the engine writes to `.mcp.json`): a merge or a push made as a tool call is no shell
 * call, so neither the prefix rows nor the shell guard see it (review/214, review/226).
 * A row cannot read a tool's arguments, so a pull-request update through that server is
 * refused whole; `gh pr edit` through the shell stays the route.
 */
export const CLAUDE_DENY_ROWS: readonly string[] = [
  "Bash(git push --force:*)",
  "Bash(git push -f:*)",
  "Bash(git push --force-with-lease:*)",
  "Bash(git push --force-if-includes:*)",
  "Bash(git push origin --force:*)",
  "Bash(git push origin -f:*)",
  "Bash(git push origin --force-with-lease:*)",
  "Bash(git push --tags:*)",
  "Bash(git push origin --tags:*)",
  "Bash(git push --follow-tags:*)",
  "Bash(git push --mirror:*)",
  "Bash(git push --all:*)",
  "Bash(git push --delete:*)",
  "Bash(git push origin --delete:*)",
  "Bash(git push -d:*)",
  "Bash(git push origin -d:*)",
  "Bash(git tag -a:*)",
  "Bash(git tag -s:*)",
  "Bash(git tag -d:*)",
  "Bash(git tag -f:*)",
  "Bash(git tag -m:*)",
  "Bash(git tag --annotate:*)",
  "Bash(git tag --sign:*)",
  "Bash(git tag --delete:*)",
  "Bash(git tag --force:*)",
  "Bash(gh pr merge:*)",
  "Bash(gh pr ready:*)",
  "Bash(gh release create:*)",
  "Bash(gh release delete:*)",
  "Bash(gh release delete-asset:*)",
  "Bash(gh release edit:*)",
  "Bash(gh release upload:*)",
  "Bash(npm publish:*)",
  "Bash(pnpm publish:*)",
  "Bash(yarn publish:*)",
  "Bash(yarn npm publish:*)",
  "Bash(bun publish:*)",
  "Bash(gh secret set:*)",
  "Bash(gh secret delete:*)",
  "Bash(gh secret remove:*)",
  "Bash(gh variable set:*)",
  "Bash(gh variable delete:*)",
  "Bash(gh variable remove:*)",
  "Bash(gh repo edit --default-branch:*)",
  "Bash(gh repo edit --visibility:*)",
  "Bash(gh repo rename:*)",
  "Bash(gh repo delete:*)",
  "Bash(gh repo archive:*)",
  "Bash(gh repo transfer:*)",
  "mcp__github__merge_pull_request",
  "mcp__github__push_files",
  "mcp__github__create_or_update_file",
  "mcp__github__delete_file",
  "mcp__github__update_pull_request_branch",
  // review/226: these names were read on 2026-10-16 from the GitHub MCP server's README and its `pkg/github/`
  // sources. `create_pull_request_review`, `submit_pending_pull_request_review`, `update_pull_request_state` and
  // `update_pull_request_draft_state` are registered behind its `pull_requests_granular` flag. Like the rows above,
  // these name a server configured as `github`; a server given another name escapes them.
  "mcp__github__pull_request_review_write",
  "mcp__github__create_pull_request_review",
  "mcp__github__submit_pending_pull_request_review",
  "mcp__github__update_pull_request",
  "mcp__github__update_pull_request_state",
  "mcp__github__update_pull_request_draft_state",
  "mcp__github__create_branch",
  "mcp__github__delete_repository",
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
 * Self-contained, so the emitted guard can carry it as source (see the module
 * comment).
 */
export function personOnlyVerdict(command: string, ctx: PersonOnlyContext): PersonOnlyVerdict {
  // <shell-reading>
  const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;
  const KEYWORDS = new Set(["!", "{", "}", "if", "then", "else", "elif", "fi", "do", "done", "while", "until"]);
  const WRAPPERS = new Set(["env", "command", "builtin", "exec", "nohup", "sudo", "doas", "nice", "timeout", "stdbuf", "time", "xargs",
    "npx", "bunx", "pnpx"]);
  /**
   * Package runners spelled as a program and a subcommand; each runs its first positional word as a program, or
   * (`bun exec`, yarn's `exec`) as a shell line.
   */
  const RUNNERS = new Set(["npm exec", "npm x", "pnpm dlx", "pnpm exec", "yarn dlx", "yarn exec", "bun x", "bun exec"]);
  const RUNNER_OPTIONS: readonly [string, string[], string[]] = ["pw", ["--package", "--workspace", "--filter"], ["-c", "--call", "--shell-mode"]];
  const NO_OPTIONS: readonly [string, string[], string[]] = ["", [], []];
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

  /** A program word as the shell finds it: its last path part, without case or a Windows suffix. */
  function programName(word: string): string {
    const last = word.split(/[\\/]/).pop() ?? "";
    return last.toLowerCase().replace(/\.(exe|cmd|bat)$/, "");
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
    let i = 0;
    while (i < text.length) {
      const ch = text[i] ?? "";
      if (ch === "'") {
        const close = text.indexOf("'", i + 1);
        const stop = close === -1 ? text.length : close;
        word += text.slice(i + 1, stop);
        inWord = true;
        i = stop + 1;
      } else if (ch === '"') {
        inWord = true;
        i += 1;
        while (i < text.length && text[i] !== '"') {
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
   * a plain character (review/194).
   */
  function commandsOf(text: string, depth: number, pwsh: boolean): string[][] {
    const { segments, nested } = splitLine(text, true, pwsh);
    // A PowerShell line is read with a POSIX shell's escapes too, and a line with a brace with its braces as words too
    // (review/185), so either reading adds denials and never lifts one: `git push origin x} -f` still forces.
    const commands: string[][] = pwsh ? commandsOf(text, depth, false) : [];
    for (const words of [...segments, ...(/[{}]/.test(text) ? splitLine(text, false, pwsh).segments : [])]) {
      let k = 0;
      let line: string | null = null;
      while (k < words.length && line === null) {
        const word = words[k] ?? "";
        const runner = `${programName(word)} ${words[k + 1] ?? ""}`;
        if (ASSIGNMENT.test(word) || KEYWORDS.has(word)) {
          if (ASSIGNMENT.test(word)) assigned.push(word);
          k += 1;
        } else if (WRAPPERS.has(programName(word)) || RUNNERS.has(runner)) {
          // A wrapper's options are skipped with their values, so `sudo -u root git …` reads `git` as the program.
          const [short, long, lineOptions] = RUNNERS.has(runner)
            ? RUNNER_OPTIONS
            : (WRAPPER_OPTIONS.get(programName(word)) ?? NO_OPTIONS);
          k += RUNNERS.has(runner) ? 2 : 1;
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
        if (depth < 4) commands.push(...commandsOf(line, depth + 1, pwsh));
        continue;
      }
      const cmd = words.slice(k);
      if (cmd.length === 0) continue;
      // A program word holding a whole command line (`bun exec 'git push'`) is also read as that line.
      if (depth < 4 && /\s/.test(cmd[0] ?? "")) commands.push(...commandsOf(cmd.join(" "), depth + 1, pwsh));
      cmd[0] = programName(cmd[0] ?? "");
      // git's dashed form (`git-push`, as git's exec path holds it) is git running that subcommand.
      if (/^git-./.test(cmd[0])) cmd.splice(0, 1, "git", cmd[0].slice(4));
      if (depth < 4 && SHELLS.has(cmd[0] ?? "")) {
        const flag = cmd.findIndex((word, index) => index > 0 && /^-[A-Za-z]*c[A-Za-z]*$/.test(word));
        const script = flag === -1 ? undefined : cmd[flag + 1];
        if (script !== undefined) commands.push(...commandsOf(script, depth + 1, false));
      } else if (depth < 4 && cmd[0] === "eval") {
        commands.push(...commandsOf(cmd.slice(1).join(" "), depth + 1, false));
      } else if (depth < 4 && POWERSHELLS.has(cmd[0] ?? "")) {
        // PowerShell's command string (build/89): the words after `-Command`; with none, the words from the first one
        // that is no option, and each later word holding a blank, a quoted command past an option's value, each read
        // with PowerShell's escape (review/194).
        const at = cmd.findIndex((word, index) => index > 0 && commandFlag(word) !== null);
        const first = at !== -1 ? -1 : cmd.findIndex((word, index) => index > 0 && !/^-|^\/\w*$/.test(word));
        if (at !== -1) commands.push(...commandsOf([commandFlag(cmd[at] ?? ""), ...cmd.slice(at + 1)].join(" "), depth + 1, true));
        else if (first !== -1) commands.push(...commandsOf(cmd.slice(first).join(" "), depth + 1, true));
        for (const word of first === -1 ? [] : cmd.slice(first + 1)) if (/\s/.test(word)) commands.push(...commandsOf(word, depth + 1, true));
      } else if (depth < 4 && cmd[0] === "cmd") {
        // The Windows command interpreter (review/183): the words after `/c` or `/k`, any letter case, a value attached,
        // read as PowerShell's are, a backslash being a plain character there too (review/194).
        const at = cmd.findIndex((word, index) => index > 0 && /^\/[ck]/i.test(word));
        if (at !== -1) commands.push(...commandsOf([(cmd[at] ?? "").slice(2), ...cmd.slice(at + 1)].join(" "), depth + 1, true));
      } else if (depth < 4 && cmd[0] === "git") {
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
    if (depth < 4) for (const inner of nested) commands.push(...commandsOf(inner, depth + 1, pwsh));
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

  /** gh's positional words, `-R`/`--repo` and its value skipped. */
  function ghPositionals(cmd: string[]): string[] {
    const positionals: string[] = [];
    for (let k = 1; k < cmd.length; k += 1) {
      const word = cmd[k] ?? "";
      if (word === "-R" || word === "--repo") k += 1;
      else if (!word.startsWith("-")) positionals.push(word);
    }
    return positionals;
  }

  /**
   * An HTTP call's method (the tool's default unless a flag or a body sets it), whether that is a write, and each
   * target's path below its repository or organisation (`repos/<o>/<r>/` cut), without scheme, host, query or a
   * trailing slash and with its percent-encoding decoded (build/76); the repository's own path stays whole.
   */
  function httpCall(cmd: string[]): { write: boolean; method: string; paths: string[] } {
    const tool = cmd[0] ?? "";
    let method: string | null = null;
    let body = false;
    const targets: string[] = [];
    const start = tool === "gh" ? cmd.indexOf("api") + 1 : 1;
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
    for (let k = start; k < cmd.length; k += 1) {
      const word = cmd[k] ?? "";
      const name = word.split("=")[0] ?? "";
      if (word === "-X" || word === "--method" || word === "--request") {
        method = cmd[k + 1] ?? "";
        k += 1;
      } else if (name === "--method" || name === "--request") {
        method = word.slice(name.length + 1);
      } else if (/^-X./.test(word)) {
        method = word.slice(2);
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
      } else if (/^-[A-Za-z]{2,}$/.test(word) && tool !== "gh") {
        // A short cluster such as `-sX POST` or `-sd @body.json`.
        const x = word.indexOf("X");
        if (x !== -1) {
          method = x === word.length - 1 ? (cmd[k + 1] ?? "") : word.slice(x + 1);
          if (x === word.length - 1) k += 1;
        } else if (/[dFT]/.test(word)) {
          body = true;
          if (/[dFT]$/.test(word)) k += 1;
        }
      } else if (/^-[fF]./.test(word) && tool === "gh") {
        body = true;
      } else if (!word.startsWith("-")) {
        targets.push(word);
      }
    }
    const verb = (method ?? (body ? "POST" : "GET")).toUpperCase();
    const paths = targets.map((target) =>
      (target
        .replace(/^[A-Za-z][A-Za-z0-9+.-]*:\/\/[^/]*/, "")
        .replace(/^[\w-]+(\.[\w-]+)+(:\d+)?(?=\/)/, "")
        .replace(/^\/+/, "")
        .replace(/^api\/v3\//i, "")
        .split(/[?#]/)[0] ?? "")
        .replace(/%([0-9A-Fa-f]{2})/g, (_, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)))
        // A trailing slash dropped first, so the bare repository path stays `repos/<o>/<r>` (or `repositories/<id>`).
        .replace(/\/+$/, "")
        .replace(/^repos\/[^/]+\/[^/]+\//i, "")
        .replace(/^(orgs|enterprises|users|repositories)\/[^/]+\//i, ""),
    );
    return { write: ["POST", "PUT", "PATCH", "DELETE"].includes(verb), method: verb, paths };
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
  const deny =(rule: PersonOnlyRuleId, what: string): PersonOnlyVerdict => ({
    deny: true,
    rule,
    reason:
      `${what} is a person-only act (${rule}): the person runs it, never the agent (REQ-FLOW-102). ` +
      `Stop here and list it for the person.`,
  });

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
      if ((key === "push.followtags" || /^remote\..+\.mirror$/.test(key)) && on) tags = true;
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
        if (["--force", "--force-with-lease", "--force-if-includes"].includes(name)) force = true;
        else if (["--tags", "--follow-tags", "--mirror", "--all", "--branches"].includes(name)) tags = true;
        else if (["--delete", "--prune"].includes(name)) remove = true;
        else if (name === "--repo") {
          repoGiven = true;
          if (!arg.includes("=")) j += 1;
        } else if (["--push-option", "--receive-pack", "--exec"].includes(name) && !arg.includes("=")) j += 1;
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
    if (tagWord !== -1 && tagWord < named.length - 1) return deny("push-tags", "A push of tags");
    const refspecs = named.length > 0 ? named : configured;
    // A reason names the act and a branch at most, never the arguments: a remote URL can carry a credential.
    if (force || refspecs.some((spec) => spec.startsWith("+"))) return deny("force-push", "A force push");
    if (remove || refspecs.some((spec) => spec.length > 1 && spec.startsWith(":"))) {
      return deny("push-delete", "A remote branch deletion");
    }
    // A side naming a tag (`refs/tags/…`, `tags/…`, or a bare local tag name) pushes one: git gives a bare
    // destination the source's `refs/tags/` namespace, so `v1:x` and `refs/tags/v1:x` create the remote tag `x`.
    const namesTag = (side: string): boolean =>
      side !== "" && (/^(refs\/)?tags\//i.test(side) || isTagName(side.toLowerCase()));
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
    const positionals: string[] = [];
    for (let j = 0; j < args.length; j += 1) {
      const arg = args[j] ?? "";
      if (arg === "--") {
        positionals.push(...args.slice(j + 1));
        break;
      }
      if (arg.startsWith("--")) {
        const name = arg.split("=")[0] ?? "";
        if (write.has(name)) return deny("tag", "A tag write (`git tag`)");
        if (listing.has(name)) list = true;
        if (valued.has(name) && !arg.includes("=")) j += 1;
      } else if (arg.startsWith("-") && arg.length > 1) {
        // `-n<num>` lists; any of a s u f d m F e v in a short cluster writes or verifies.
        if (/[asufdmFev]/.test(arg.slice(1).replace(/n\d*$/, ""))) return deny("tag", "A tag write (`git tag`)");
        if (/[ln]/.test(arg)) list = true;
      } else positionals.push(arg);
    }
    return list || positionals.length === 0 ? null : deny("tag", "A tag created (`git tag <name>`)");
  }

  function ghVerdict(cmd: string[]): PersonOnlyVerdict | null {
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
    if (group === "pr" && sub === "merge") return deny("pr-merge", "Merging a pull request (`gh pr merge`)");
    // Closing with `--delete-branch` deletes the pull request's head branch on the remote (review/207).
    if (group === "pr" && sub === "close" && flag("--delete-branch", "d", "c")) {
      return deny("push-delete", "A remote branch deletion (`gh pr close --delete-branch`)");
    }
    // An approval counts toward a required review, as a merge's own gate (review/210).
    if (group === "pr" && sub === "review" && flag("--approve", "a", "bF")) {
      return deny("pr-merge", "Approving a pull request review (`gh pr review --approve`)");
    }
    if (group === "pr" && sub === "ready") return deny("pr-ready", "Marking a pull request ready (`gh pr ready`)");
    if (group === "release" && sub !== undefined && !["list", "ls", "view", "download"].includes(sub)) {
      return deny("release", "A release write (`gh release`)");
    }
    if ((group === "secret" || group === "variable") && sub !== undefined && !["list", "ls"].includes(sub)) {
      return deny("secrets", `A ${group} write (\`gh ${group}\`)`);
    }
    if (group === "repo" && (sub === "delete" || sub === "archive" || sub === "rename" || sub === "transfer")) {
      return deny("protection", `A repository ${sub} (\`gh repo ${sub}\`)`);
    }
    if (group === "repo" && sub === "edit" && cmd.some((word) => /^--default-branch(=|$)/.test(word))) {
      return deny("protection", "A default-branch change (`gh repo edit --default-branch`)");
    }
    if (group === "repo" && sub === "edit" && cmd.some((word) => /^--visibility(=|$)/.test(word))) {
      return deny("protection", "A visibility change (`gh repo edit --visibility`)");
    }
    if (group === "api") return httpVerdict(cmd);
    return null;
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
  function httpVerdict(cmd: string[]): PersonOnlyVerdict | null {
    const gh = cmd[0] === "gh";
    // gh fills `{branch}` and `:branch` (its own placeholder pattern) from the checkout, in the endpoint and in a typed
    // `-F` field (review/127): the current branch, or the default branch where the checkout is on none.
    const fill = (value: string): string =>
      value.replace(/\{branch\}|:branch\b/g, () => (ctx.currentBranch === null ? "main" : branch(ctx.currentBranch)));
    const { write, method, paths: targets } = httpCall(cmd);
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
    /** Per call of the GraphQL field `name` in the line's GraphQL texts, the values its own arguments give `key`. */
    const calls = (name: string, key: string): (string | null)[][] => {
      const found: (string | null)[][] = [];
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
          const values: (string | null)[] = [];
          for (const arg of masked.slice(start, end).matchAll(new RegExp(`\\b${key}\\s*:\\s*`, "g"))) {
            const after = query.slice(start + (arg.index ?? 0) + arg[0].length);
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
            values.push(value);
          }
          found.push(values);
        }
      }
      return found;
    };
    /** Whether a call of `name` the line names lands on the default branch: none readable, or one not placed there. */
    const callsLand = (name: string, key: string): boolean => {
      const found = calls(name, key);
      return found.length === 0 || found.some(landsOnDefault);
    };
    for (const path of paths) {
      const shown = `${method} ${path}`;
      if (/^graphql$/i.test(path)) {
        if (/\b(mergePullRequest|enablePullRequestAutoMerge)\b/.test(text)) return deny("pr-merge", "A GraphQL merge");
        if (/\bmarkPullRequestReadyForReview\b/.test(text)) return deny("pr-ready", "A GraphQL ready-for-review");
        // A review added or submitted with the event `APPROVE` (review/210); an event the line cannot show (a variable,
        // a call it cannot find) reads as one, and a review with no event is the API's pending one.
        if (/\b(addPullRequestReview|submitPullRequestReview)\b/.test(text)) {
          const reviews = [...calls("addPullRequestReview", "event"), ...calls("submitPullRequestReview", "event")];
          const variables = queries.some((query) => mask(query).includes("$"));
          if (
            reviews.length === 0 ||
            reviews.some((events) => (events.length === 0 && variables) || events.some((event) => event === null || /^approve$/i.test(event)))
          ) {
            return deny("pr-merge", "A GraphQL review approval, or a review whose event the line cannot show");
          }
        }
        if (/\bcreateCommitOnBranch\b/.test(text) && callsLand("createCommitOnBranch", "branchName")) {
          return deny("push-default", "A GraphQL commit to the default branch");
        }
        if (/\bmergeBranch\b/.test(text) && callsLand("mergeBranch", "base")) {
          return deny("push-default", "A GraphQL merge into the default branch");
        }
        if (/\bupdateRefs?\b/.test(text)) {
          if ([...calls("updateRef", "force"), ...calls("updateRefs", "force")].some(forced)) {
            return deny("force-push", "A forced GraphQL ref update");
          }
          // The batch form names each ref (review/108); the single form names it by id, which the line cannot show.
          if (calls("updateRefs", "name").flat().some((ref) => ref !== null && /^refs\/tags\//i.test(ref))) {
            return deny("push-tags", "A GraphQL tag ref update");
          }
          // A list element given whole as a variable, beside literal ones, names a ref the line cannot show (review/128).
          const hidden = queries.some((query) => /\brefUpdates\s*:\s*\[(?:[^\]]*,)?\s*\$/.test(mask(query)));
          if (/\bupdateRef\b/.test(text) || hidden || callsLand("updateRefs", "name")) {
            return deny("push-default", "A GraphQL ref update onto the default branch, or onto a ref the line cannot show");
          }
        }
        // The GraphQL twins of the REST ref writes (build/75): any ref deletion, and a ref created as a tag or on the
        // default branch, a name the line cannot show reading as a tag.
        if (/\bdeleteRef\b/.test(text)) return deny("push-delete", "A GraphQL ref deletion");
        if (/\bcreateRef\b/.test(text)) {
          const created = calls("createRef", "name");
          if (created.length === 0 || created.some((refs) => refs.length === 0 || refs.some((ref) => ref === null || /^refs\/tags\//i.test(ref)))) {
            return deny("push-tags", "A GraphQL tag ref created, or a ref the line cannot show");
          }
          if (created.flat().some((ref) => ref !== null && defaults.has(branch(ref)))) {
            return deny("push-default", "A GraphQL ref created on the default branch");
          }
        }
        continue;
      }
      if (!write) continue;
      if (/^pulls\/[^/]+\/merge(\/|$)/i.test(path) || /(^|\/)merge-async(\/|$)/i.test(path)) {
        return deny("pr-merge", `A REST merge (${shown})`);
      }
      // A review created, or a pending one submitted, with the event `APPROVE` (review/210); an event the line shows
      // but cannot place reads as one, and so does a body the line cannot show (review/228), as on GraphQL; no event in
      // a body the line shows whole is the API's pending review.
      if (
        /^pulls\/[^/]+\/reviews(\/[^/]+\/events)?$/i.test(path) &&
        (hiddenBody || fields("event").some((event) => event === null || /^approve$/i.test(event.trim())))
      ) {
        return deny("pr-merge", `A REST review approval, or a review whose body the line cannot show (${shown})`);
      }
      if (/^branches\/.+\/protection(\/|$)/i.test(path) || /^rulesets(\/|$)/i.test(path)) {
        return deny("protection", `A protection or ruleset write (${shown})`);
      }
      // The repository's own path carries its default branch, visibility, name and archived state; DELETE removes it.
      if (/^(repos\/[^/]+\/[^/]+|repositories\/[^/]+)$/i.test(path) && (method === "PATCH" || method === "DELETE")) {
        return deny("protection", `A repository settings write or deletion (${shown})`);
      }
      if (/^branches\/.+\/rename$/i.test(path)) return deny("protection", `A branch rename (${shown})`);
      if (/^transfer$/i.test(path)) return deny("protection", `A repository transfer (${shown})`);
      if (/^contents(\/|$)/i.test(path) && landsOnDefault(fields("branch"))) {
        return deny("push-default", `A REST commit to the default branch (${shown})`);
      }
      if (
        (/^merges$/i.test(path) && landsOnDefault(fields("base"))) ||
        (/^merge-upstream$/i.test(path) && landsOnDefault(fields("branch")))
      ) {
        return deny("push-default", `A REST merge into the default branch (${shown})`);
      }
      if (/^((actions|dependabot|codespaces|agents)|environments\/[^/]+)\/(secrets|variables)(\/|$)/i.test(path)) {
        return deny("secrets", `A secret or variable write (${shown})`);
      }
      if (/^releases(\/|$)/i.test(path)) return deny("release", `A release write (${shown})`);
      if (/^git\/refs(\/|$)/i.test(path)) {
        if (method === "DELETE") return deny("push-delete", `A REST ref deletion (${shown})`);
        if (/^git\/refs\/tags(\/|$)/i.test(path) || /(^|[=\s])refs\/tags\//i.test(text)) {
          return deny("push-tags", `A REST tag ref write (${shown})`);
        }
        if (forced(fields("force"))) return deny("force-push", `A forced REST ref update (${shown})`);
        // The path's own ref read from the path as routing reads it (review/107); a body's `ref` from the line.
        const heads = [/^git\/refs\/heads\/(.+)$/i.exec(path)?.[1] ?? "", ...[...text.matchAll(/(?:^|[=\s/])refs\/heads\/(\S+)/gi)].map((match) => match[1] ?? "")];
        if (heads.some((name) => defaults.has(name.toLowerCase()))) {
          return deny("push-default", `A REST write to the default branch (${shown})`);
        }
      }
    }
    return null;
  }

  function publishVerdict(cmd: string[]): PersonOnlyVerdict | null {
    const valued = new Set(["--registry", "--workspace", "-w", "--prefix", "-C", "--dir", "--filter", "--userconfig",
      "--cwd", "--tag", "--otp", "--access"]);
    const positionals: string[] = [];
    for (let k = 1; k < cmd.length; k += 1) {
      const word = cmd[k] ?? "";
      if (valued.has(word)) k += 1;
      else if (!word.startsWith("-")) positionals.push(word);
    }
    const [first, second] = positionals;
    const yarnNpm = cmd[0] === "yarn" && first === "npm" && second === "publish";
    return first === "publish" || yarnNpm ? deny("publish", `Publishing a package (\`${cmd[0]} publish\`)`) : null;
  }

  for (const cmd of commandsOf(command, 0, false)) {
    const program = cmd[0] ?? "";
    let verdict: PersonOnlyVerdict | null = null;
    if (program === "git") {
      const { sub, args, config } = gitParts(cmd);
      if (sub === "push") verdict = pushVerdict(args, config);
      else if (sub === "tag") verdict = tagVerdict(args);
      else if (sub === "subtree") {
        // `git subtree push <remote> <branch>` runs `git push <remote> <split>:refs/heads/<branch>`.
        const valued = new Set(["-P", "--prefix", "-m", "--message", "-b", "--branch", "--onto"]);
        const words = args.filter((word, index) => !word.startsWith("-") && !valued.has(args[index - 1] ?? ""));
        if (words[0] === "push") verdict = pushVerdict(words.slice(1), config);
      }
    } else if (program === "gh") verdict = ghVerdict(cmd);
    else if (program === "curl" || program === "wget") verdict = httpVerdict(cmd);
    else if (["npm", "pnpm", "yarn", "bun"].includes(program)) verdict = publishVerdict(cmd);
    if (verdict !== null) return verdict;
  }
  return { deny: false };
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
 * `issues/<n>/comments` passes. The line is read as {@link personOnlyVerdict}
 * reads it.
 *
 * Self-contained, so the emitted guard can carry it as source (see the module
 * comment).
 */
export function unattendedPushVerdict(command: string): UnattendedPushVerdict {
  // <shell-reading>
  const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;
  const KEYWORDS = new Set(["!", "{", "}", "if", "then", "else", "elif", "fi", "do", "done", "while", "until"]);
  const WRAPPERS = new Set(["env", "command", "builtin", "exec", "nohup", "sudo", "doas", "nice", "timeout", "stdbuf", "time", "xargs",
    "npx", "bunx", "pnpx"]);
  /**
   * Package runners spelled as a program and a subcommand; each runs its first positional word as a program, or
   * (`bun exec`, yarn's `exec`) as a shell line.
   */
  const RUNNERS = new Set(["npm exec", "npm x", "pnpm dlx", "pnpm exec", "yarn dlx", "yarn exec", "bun x", "bun exec"]);
  const RUNNER_OPTIONS: readonly [string, string[], string[]] = ["pw", ["--package", "--workspace", "--filter"], ["-c", "--call", "--shell-mode"]];
  const NO_OPTIONS: readonly [string, string[], string[]] = ["", [], []];
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

  /** A program word as the shell finds it: its last path part, without case or a Windows suffix. */
  function programName(word: string): string {
    const last = word.split(/[\\/]/).pop() ?? "";
    return last.toLowerCase().replace(/\.(exe|cmd|bat)$/, "");
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
    let i = 0;
    while (i < text.length) {
      const ch = text[i] ?? "";
      if (ch === "'") {
        const close = text.indexOf("'", i + 1);
        const stop = close === -1 ? text.length : close;
        word += text.slice(i + 1, stop);
        inWord = true;
        i = stop + 1;
      } else if (ch === '"') {
        inWord = true;
        i += 1;
        while (i < text.length && text[i] !== '"') {
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
   * a plain character (review/194).
   */
  function commandsOf(text: string, depth: number, pwsh: boolean): string[][] {
    const { segments, nested } = splitLine(text, true, pwsh);
    // A PowerShell line is read with a POSIX shell's escapes too, and a line with a brace with its braces as words too
    // (review/185), so either reading adds denials and never lifts one: `git push origin x} -f` still forces.
    const commands: string[][] = pwsh ? commandsOf(text, depth, false) : [];
    for (const words of [...segments, ...(/[{}]/.test(text) ? splitLine(text, false, pwsh).segments : [])]) {
      let k = 0;
      let line: string | null = null;
      while (k < words.length && line === null) {
        const word = words[k] ?? "";
        const runner = `${programName(word)} ${words[k + 1] ?? ""}`;
        if (ASSIGNMENT.test(word) || KEYWORDS.has(word)) {
          if (ASSIGNMENT.test(word)) assigned.push(word);
          k += 1;
        } else if (WRAPPERS.has(programName(word)) || RUNNERS.has(runner)) {
          // A wrapper's options are skipped with their values, so `sudo -u root git …` reads `git` as the program.
          const [short, long, lineOptions] = RUNNERS.has(runner)
            ? RUNNER_OPTIONS
            : (WRAPPER_OPTIONS.get(programName(word)) ?? NO_OPTIONS);
          k += RUNNERS.has(runner) ? 2 : 1;
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
        if (depth < 4) commands.push(...commandsOf(line, depth + 1, pwsh));
        continue;
      }
      const cmd = words.slice(k);
      if (cmd.length === 0) continue;
      // A program word holding a whole command line (`bun exec 'git push'`) is also read as that line.
      if (depth < 4 && /\s/.test(cmd[0] ?? "")) commands.push(...commandsOf(cmd.join(" "), depth + 1, pwsh));
      cmd[0] = programName(cmd[0] ?? "");
      // git's dashed form (`git-push`, as git's exec path holds it) is git running that subcommand.
      if (/^git-./.test(cmd[0])) cmd.splice(0, 1, "git", cmd[0].slice(4));
      if (depth < 4 && SHELLS.has(cmd[0] ?? "")) {
        const flag = cmd.findIndex((word, index) => index > 0 && /^-[A-Za-z]*c[A-Za-z]*$/.test(word));
        const script = flag === -1 ? undefined : cmd[flag + 1];
        if (script !== undefined) commands.push(...commandsOf(script, depth + 1, false));
      } else if (depth < 4 && cmd[0] === "eval") {
        commands.push(...commandsOf(cmd.slice(1).join(" "), depth + 1, false));
      } else if (depth < 4 && POWERSHELLS.has(cmd[0] ?? "")) {
        // PowerShell's command string (build/89): the words after `-Command`; with none, the words from the first one
        // that is no option, and each later word holding a blank, a quoted command past an option's value, each read
        // with PowerShell's escape (review/194).
        const at = cmd.findIndex((word, index) => index > 0 && commandFlag(word) !== null);
        const first = at !== -1 ? -1 : cmd.findIndex((word, index) => index > 0 && !/^-|^\/\w*$/.test(word));
        if (at !== -1) commands.push(...commandsOf([commandFlag(cmd[at] ?? ""), ...cmd.slice(at + 1)].join(" "), depth + 1, true));
        else if (first !== -1) commands.push(...commandsOf(cmd.slice(first).join(" "), depth + 1, true));
        for (const word of first === -1 ? [] : cmd.slice(first + 1)) if (/\s/.test(word)) commands.push(...commandsOf(word, depth + 1, true));
      } else if (depth < 4 && cmd[0] === "cmd") {
        // The Windows command interpreter (review/183): the words after `/c` or `/k`, any letter case, a value attached,
        // read as PowerShell's are, a backslash being a plain character there too (review/194).
        const at = cmd.findIndex((word, index) => index > 0 && /^\/[ck]/i.test(word));
        if (at !== -1) commands.push(...commandsOf([(cmd[at] ?? "").slice(2), ...cmd.slice(at + 1)].join(" "), depth + 1, true));
      } else if (depth < 4 && cmd[0] === "git") {
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
    if (depth < 4) for (const inner of nested) commands.push(...commandsOf(inner, depth + 1, pwsh));
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

  /** gh's positional words, `-R`/`--repo` and its value skipped. */
  function ghPositionals(cmd: string[]): string[] {
    const positionals: string[] = [];
    for (let k = 1; k < cmd.length; k += 1) {
      const word = cmd[k] ?? "";
      if (word === "-R" || word === "--repo") k += 1;
      else if (!word.startsWith("-")) positionals.push(word);
    }
    return positionals;
  }

  /**
   * An HTTP call's method (the tool's default unless a flag or a body sets it), whether that is a write, and each
   * target's path below its repository or organisation (`repos/<o>/<r>/` cut), without scheme, host, query or a
   * trailing slash and with its percent-encoding decoded (build/76); the repository's own path stays whole.
   */
  function httpCall(cmd: string[]): { write: boolean; method: string; paths: string[] } {
    const tool = cmd[0] ?? "";
    let method: string | null = null;
    let body = false;
    const targets: string[] = [];
    const start = tool === "gh" ? cmd.indexOf("api") + 1 : 1;
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
    for (let k = start; k < cmd.length; k += 1) {
      const word = cmd[k] ?? "";
      const name = word.split("=")[0] ?? "";
      if (word === "-X" || word === "--method" || word === "--request") {
        method = cmd[k + 1] ?? "";
        k += 1;
      } else if (name === "--method" || name === "--request") {
        method = word.slice(name.length + 1);
      } else if (/^-X./.test(word)) {
        method = word.slice(2);
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
      } else if (/^-[A-Za-z]{2,}$/.test(word) && tool !== "gh") {
        // A short cluster such as `-sX POST` or `-sd @body.json`.
        const x = word.indexOf("X");
        if (x !== -1) {
          method = x === word.length - 1 ? (cmd[k + 1] ?? "") : word.slice(x + 1);
          if (x === word.length - 1) k += 1;
        } else if (/[dFT]/.test(word)) {
          body = true;
          if (/[dFT]$/.test(word)) k += 1;
        }
      } else if (/^-[fF]./.test(word) && tool === "gh") {
        body = true;
      } else if (!word.startsWith("-")) {
        targets.push(word);
      }
    }
    const verb = (method ?? (body ? "POST" : "GET")).toUpperCase();
    const paths = targets.map((target) =>
      (target
        .replace(/^[A-Za-z][A-Za-z0-9+.-]*:\/\/[^/]*/, "")
        .replace(/^[\w-]+(\.[\w-]+)+(:\d+)?(?=\/)/, "")
        .replace(/^\/+/, "")
        .replace(/^api\/v3\//i, "")
        .split(/[?#]/)[0] ?? "")
        .replace(/%([0-9A-Fa-f]{2})/g, (_, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)))
        // A trailing slash dropped first, so the bare repository path stays `repos/<o>/<r>` (or `repositories/<id>`).
        .replace(/\/+$/, "")
        .replace(/^repos\/[^/]+\/[^/]+\//i, "")
        .replace(/^(orgs|enterprises|users|repositories)\/[^/]+\//i, ""),
    );
    return { write: ["POST", "PUT", "PATCH", "DELETE"].includes(verb), method: verb, paths };
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
    /\b(createPullRequest|updatePullRequest|updatePullRequestBranch|createCommitOnBranch|createRef|updateRef|updateRefs|deleteRef|mergeBranch|mergePullRequest|enablePullRequestAutoMerge)\b/;
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
  /** git's environment variables whose value is a program git runs (review/208): twins of the `-c` keys refused below. */
  const PROGRAM_VARIABLES =
    "GIT_EDITOR|GIT_SEQUENCE_EDITOR|GIT_SSH_COMMAND|GIT_SSH|GIT_EXTERNAL_DIFF|GIT_ASKPASS|GIT_PAGER|GIT_PROXY_COMMAND|GIT_EXEC_PATH";
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

  const commands = commandsOf(command, 0, false);
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
    const { write, method, paths } = httpCall(cmd);
    for (const path of paths) {
      if (/^graphql$/i.test(path)) {
        if (GRAPHQL_MOVES.test(cmd.join(" "))) return deny("A GraphQL mutation that moves a branch or a pull request");
      } else if (write && MOVES.some((pattern) => pattern.test(path))) {
        return deny(`A REST write that moves a branch or a pull request (${method} ${path})`);
      }
    }
  }
  // Whatever program the line runs (review/231): one of those variables set on it reaches what that program starts,
  // the run verbs' own git among them (`GIT_EXEC_PATH=<folder> stamity run end`). A line that only names one passes.
  if (
    assigned.some((word) => SETS_WORD.test(word)) ||
    commands.some((cmd) => {
      const exports = cmd[0] === "export" || (EXPORTERS.has(cmd[0] ?? "") && cmd.slice(1).some((word) => EXPORTS.test(word)));
      return SETTERS.has(cmd[0] ?? "") && cmd.slice(1).some((word) => SETS_WORD.test(word) && (exports || word.includes("=")));
    }) ||
    SETS_TEXT.test(command)
  ) {
    return deny("A line that sets one of git's program or configuration variables (`GIT_EXEC_PATH`, `GIT_EDITOR`, `GIT_CONFIG_COUNT`, …), which the run verbs' own git reads,");
  }
  return { deny: false };
}
