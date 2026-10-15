/**
 * Person-only acts (REQ-FLOW-102) and the unattended push rule (REQ-FLOW-120):
 * the table the shell guard and Claude Code's deny rows share.
 *
 * **Person-only acts** are refused to the main thread on every client, attended
 * or not: a force push, a push of a tag or of the default branch (named, or
 * implied by a refspec-less push or `HEAD` while on it), a remote branch
 * deletion, a tag, a merge, `gh pr ready`, a release, a publish, a secret,
 * variable, protection or ruleset write, and a default-branch change, deletion
 * or archive of the repository. {@link personOnlyVerdict} reads a
 * command line for them; {@link CLAUDE_DENY_ROWS} is the part a Claude Code
 * prefix rule can say, so the settings layer and the guard agree.
 *
 * **While a run is unattended** the run verbs (`stamity run checkpoint`, `run
 * end`) are the only push path: {@link unattendedPushVerdict} refuses any raw
 * `git push`, `gh pr create` or `gh pr edit` and a REST write that moves a
 * branch or a pull request, so the held paths and the last secret scan cannot
 * be stepped around. A reply on a comments endpoint passes. Whether a run is
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
 * a bare tag name the context's `tags` does not list, a repository's own push
 * configuration, a GraphQL mutation read from a file — passes. The tests assert
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
  { id: "force-push", act: "a force push (`-f`, `--force`, `--force-with-lease`, `--force-if-includes`, a `+` refspec)" },
  { id: "push-default", act: "a push to the default branch, named or implied by a refspec-less push or `HEAD` while on it" },
  {
    id: "push-tags",
    act: "a push of tags (`--tags`, `--follow-tags`, `--mirror`, `--all`, a refspec naming a tag: `refs/tags/…`, `tags/…` or a local tag's bare name)",
  },
  { id: "push-delete", act: "a remote branch deletion (`--delete`, `-d`, a `:ref` refspec)" },
  { id: "tag", act: "creating or deleting a tag (`git tag` beyond listing)" },
  { id: "pr-merge", act: "merging a pull request (`gh pr merge`, the REST or GraphQL merge)" },
  { id: "pr-ready", act: "marking a pull request ready for review (`gh pr ready`)" },
  { id: "release", act: "creating, editing or deleting a release (`gh release` beyond list, view, download)" },
  { id: "publish", act: "publishing a package (`npm`, `pnpm`, `yarn`, `bun` publish)" },
  { id: "secrets", act: "writing a secret or a variable (`gh secret`, `gh variable` beyond list, their REST paths)" },
  {
    id: "protection",
    act: "writing branch protection or a ruleset, or the repository itself (`gh repo edit --default-branch`, `gh repo delete`, `gh repo archive`)",
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
 * every row's prefix is one {@link personOnlyVerdict} denies, so the two layers
 * never disagree on what is the person's.
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
  "Bash(gh repo delete:*)",
  "Bash(gh repo archive:*)",
];

/**
 * Whether `command` holds a person-only act (REQ-FLOW-102). The line is read as
 * a shell would split it: quotes honoured, segments split on `&&`, `||`, `;`,
 * `|`, `&`, a newline, a subshell's parentheses and a command substitution
 * (inside double quotes too), redirections and comments dropped, leading
 * assignments, keywords and wrappers (`env`, `command`, `sudo`, …) skipped, a
 * literal `sh -c` or `eval` argument read as its own line, and git's global
 * options (`-c k=v` pairs among them) skipped before the subcommand.
 *
 * Self-contained, so the emitted guard can carry it as source (see the module
 * comment).
 */
export function personOnlyVerdict(command: string, ctx: PersonOnlyContext): PersonOnlyVerdict {
  // <shell-reading>
  const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;
  const KEYWORDS = new Set(["!", "{", "}", "if", "then", "else", "elif", "fi", "do", "done", "while", "until", "time"]);
  const WRAPPERS = new Set(["env", "command", "builtin", "exec", "nohup", "sudo", "doas", "nice", "timeout", "stdbuf", "time", "xargs"]);
  const SHELLS = new Set(["sh", "bash", "zsh", "dash", "ksh"]);

  /** A program word as the shell finds it: its last path part, without case or a Windows suffix. */
  function programName(word: string): string {
    const last = word.split(/[\\/]/).pop() ?? "";
    return last.toLowerCase().replace(/\.(exe|cmd|bat)$/, "");
  }

  /** The words of each simple command in `text`, a command substitution's text read as its own lines. */
  function splitLine(text: string): { segments: string[][]; nested: string[] } {
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
          if (c === "\\" && i + 1 < text.length) {
            word += '"\\$`'.includes(next) ? next : next === "\n" ? "" : c + next;
            i += 2;
          } else if ((c === "$" && next === "(") || c === "`") {
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
      } else if (ch === "\\") {
        const next = text[i + 1];
        if (next !== undefined && next !== "\n") {
          word += next;
          inWord = true;
        }
        i += 2;
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
      } else if (";&|\n\r()`".includes(ch)) {
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

  /** Each simple command's words, its program word first and normalized; `sh -c` and `eval` text read too. */
  function commandsOf(text: string, depth: number): string[][] {
    const { segments, nested } = splitLine(text);
    const commands: string[][] = [];
    for (const words of segments) {
      let k = 0;
      while (k < words.length) {
        const word = words[k] ?? "";
        if (ASSIGNMENT.test(word) || KEYWORDS.has(word)) {
          k += 1;
        } else if (WRAPPERS.has(programName(word))) {
          k += 1;
          while (k < words.length && /^(-|\d)/.test(words[k] ?? "")) k += 1;
          while (k < words.length && ASSIGNMENT.test(words[k] ?? "")) k += 1;
        } else break;
      }
      const cmd = words.slice(k);
      if (cmd.length === 0) continue;
      cmd[0] = programName(cmd[0] ?? "");
      if (depth < 4 && SHELLS.has(cmd[0])) {
        const flag = cmd.findIndex((word, index) => index > 0 && /^-[A-Za-z]*c[A-Za-z]*$/.test(word));
        const script = flag === -1 ? undefined : cmd[flag + 1];
        if (script !== undefined) commands.push(...commandsOf(script, depth + 1));
      } else if (depth < 4 && cmd[0] === "eval") {
        commands.push(...commandsOf(cmd.slice(1).join(" "), depth + 1));
      }
      commands.push(cmd);
    }
    if (depth < 4) for (const inner of nested) commands.push(...commandsOf(inner, depth + 1));
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
   * target's path below its repository or organisation (`repos/<o>/<r>/` cut), without scheme, host or query.
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
  const tagNames = new Set(ctx.tags.map((tag) => tag.replace(/^refs\/tags\//i, "").toLowerCase()));
  const deny = (rule: PersonOnlyRuleId, what: string): PersonOnlyVerdict => ({
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
    for (const pair of config) {
      const eq = pair.indexOf("=");
      const key = (eq === -1 ? pair : pair.slice(0, eq)).toLowerCase();
      const value = eq === -1 ? "true" : pair.slice(eq + 1).toLowerCase();
      const on = !["false", "no", "off", "0", ""].includes(value);
      if ((key === "push.followtags" || /^remote\..+\.mirror$/.test(key)) && on) tags = true;
      if (key === "push.default" && value === "matching") matching = true;
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
    const refspecs = repoGiven ? positionals : positionals.slice(1);
    // A reason names the act and a branch at most, never the arguments: a remote URL can carry a credential.
    if (force || refspecs.some((spec) => spec.startsWith("+"))) return deny("force-push", "A force push");
    if (remove || refspecs.some((spec) => spec.length > 1 && spec.startsWith(":"))) {
      return deny("push-delete", "A remote branch deletion");
    }
    // A side naming a tag (`refs/tags/…`, `tags/…`, or a bare local tag name) pushes one: git gives a bare
    // destination the source's `refs/tags/` namespace, so `v1:x` and `refs/tags/v1:x` create the remote tag `x`.
    const namesTag = (side: string): boolean =>
      side !== "" && (/^(refs\/)?tags\//i.test(side) || tagNames.has(side.toLowerCase()));
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
    }
    if (refspecs.length === 0 && (onDefault || matching)) {
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
    if (group === "pr" && sub === "merge") return deny("pr-merge", "Merging a pull request (`gh pr merge`)");
    if (group === "pr" && sub === "ready") return deny("pr-ready", "Marking a pull request ready (`gh pr ready`)");
    if (group === "release" && sub !== undefined && !["list", "ls", "view", "download"].includes(sub)) {
      return deny("release", "A release write (`gh release`)");
    }
    if ((group === "secret" || group === "variable") && sub !== undefined && !["list", "ls"].includes(sub)) {
      return deny("secrets", `A ${group} write (\`gh ${group}\`)`);
    }
    if (group === "repo" && (sub === "delete" || sub === "archive")) {
      return deny("protection", `A repository ${sub} (\`gh repo ${sub}\`)`);
    }
    if (group === "repo" && sub === "edit" && cmd.some((word) => /^--default-branch(=|$)/.test(word))) {
      return deny("protection", "A default-branch change (`gh repo edit --default-branch`)");
    }
    if (group === "api") return httpVerdict(cmd);
    return null;
  }

  /** A REST or GraphQL person-only act; each path is read below its repository or organisation. */
  function httpVerdict(cmd: string[]): PersonOnlyVerdict | null {
    const { write, method, paths } = httpCall(cmd);
    const text = cmd.join(" ");
    for (const path of paths) {
      const shown = `${method} ${path}`;
      if (/^graphql$/i.test(path)) {
        if (/\b(mergePullRequest|enablePullRequestAutoMerge)\b/.test(text)) return deny("pr-merge", "A GraphQL merge");
        if (/\bmarkPullRequestReadyForReview\b/.test(text)) return deny("pr-ready", "A GraphQL ready-for-review");
        continue;
      }
      if (!write) continue;
      if (/^pulls\/[^/]+\/merge(\/|$)/i.test(path) || /(^|\/)merge-async(\/|$)/i.test(path)) {
        return deny("pr-merge", `A REST merge (${shown})`);
      }
      if (/^branches\/.+\/protection(\/|$)/i.test(path) || /^rulesets(\/|$)/i.test(path)) {
        return deny("protection", `A protection or ruleset write (${shown})`);
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
        const heads = [...text.matchAll(/(?:^|[=\s/])refs\/heads\/(\S+)/gi)].map((match) => (match[1] ?? "").toLowerCase());
        if (heads.some((name) => defaults.has(name))) return deny("push-default", `A REST write to the default branch (${shown})`);
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

  for (const cmd of commandsOf(command, 0)) {
    const program = cmd[0] ?? "";
    let verdict: PersonOnlyVerdict | null = null;
    if (program === "git") {
      const { sub, args, config } = gitParts(cmd);
      if (sub === "push") verdict = pushVerdict(args, config);
      else if (sub === "tag") verdict = tagVerdict(args);
    } else if (program === "gh") verdict = ghVerdict(cmd);
    else if (program === "curl" || program === "wget") verdict = httpVerdict(cmd);
    else if (["npm", "pnpm", "yarn", "bun"].includes(program)) verdict = publishVerdict(cmd);
    if (verdict !== null) return verdict;
  }
  return { deny: false };
}

/**
 * Whether `command` steps around the run verbs while a run is unattended
 * (REQ-FLOW-120): any `git push`, `gh pr create` or `gh pr edit`, and a `gh
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
  const KEYWORDS = new Set(["!", "{", "}", "if", "then", "else", "elif", "fi", "do", "done", "while", "until", "time"]);
  const WRAPPERS = new Set(["env", "command", "builtin", "exec", "nohup", "sudo", "doas", "nice", "timeout", "stdbuf", "time", "xargs"]);
  const SHELLS = new Set(["sh", "bash", "zsh", "dash", "ksh"]);

  /** A program word as the shell finds it: its last path part, without case or a Windows suffix. */
  function programName(word: string): string {
    const last = word.split(/[\\/]/).pop() ?? "";
    return last.toLowerCase().replace(/\.(exe|cmd|bat)$/, "");
  }

  /** The words of each simple command in `text`, a command substitution's text read as its own lines. */
  function splitLine(text: string): { segments: string[][]; nested: string[] } {
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
          if (c === "\\" && i + 1 < text.length) {
            word += '"\\$`'.includes(next) ? next : next === "\n" ? "" : c + next;
            i += 2;
          } else if ((c === "$" && next === "(") || c === "`") {
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
      } else if (ch === "\\") {
        const next = text[i + 1];
        if (next !== undefined && next !== "\n") {
          word += next;
          inWord = true;
        }
        i += 2;
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
      } else if (";&|\n\r()`".includes(ch)) {
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

  /** Each simple command's words, its program word first and normalized; `sh -c` and `eval` text read too. */
  function commandsOf(text: string, depth: number): string[][] {
    const { segments, nested } = splitLine(text);
    const commands: string[][] = [];
    for (const words of segments) {
      let k = 0;
      while (k < words.length) {
        const word = words[k] ?? "";
        if (ASSIGNMENT.test(word) || KEYWORDS.has(word)) {
          k += 1;
        } else if (WRAPPERS.has(programName(word))) {
          k += 1;
          while (k < words.length && /^(-|\d)/.test(words[k] ?? "")) k += 1;
          while (k < words.length && ASSIGNMENT.test(words[k] ?? "")) k += 1;
        } else break;
      }
      const cmd = words.slice(k);
      if (cmd.length === 0) continue;
      cmd[0] = programName(cmd[0] ?? "");
      if (depth < 4 && SHELLS.has(cmd[0])) {
        const flag = cmd.findIndex((word, index) => index > 0 && /^-[A-Za-z]*c[A-Za-z]*$/.test(word));
        const script = flag === -1 ? undefined : cmd[flag + 1];
        if (script !== undefined) commands.push(...commandsOf(script, depth + 1));
      } else if (depth < 4 && cmd[0] === "eval") {
        commands.push(...commandsOf(cmd.slice(1).join(" "), depth + 1));
      }
      commands.push(cmd);
    }
    if (depth < 4) for (const inner of nested) commands.push(...commandsOf(inner, depth + 1));
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
   * target's path below its repository or organisation (`repos/<o>/<r>/` cut), without scheme, host or query.
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

  for (const cmd of commandsOf(command, 0)) {
    const program = cmd[0] ?? "";
    if (program === "git") {
      const { sub } = gitParts(cmd);
      if (sub === "push" || sub === "send-pack") return deny(`A raw \`git ${sub}\``);
      continue;
    }
    let http = program === "curl" || program === "wget";
    if (program === "gh") {
      const [group, sub] = ghPositionals(cmd);
      if (group === "pr" && (sub === "create" || sub === "new" || sub === "edit")) return deny(`\`gh pr ${sub}\``);
      if (group === "repo" && sub === "sync") return deny("`gh repo sync`");
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
  return { deny: false };
}
