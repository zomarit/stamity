import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { matchesDeployingBranch } from "../../src/config/autonomy.ts";
import {
  CLAUDE_ASK_ROWS,
  CLAUDE_DENY_ROWS,
  PERSON_ONLY_RULES,
  personOnlyVerdict,
  repositoryKey,
  unattendedPushVerdict,
  type PersonOnlyRuleId,
} from "../../src/hooks/personOnly.ts";
import { CURATED_MCP_SERVERS, PLATFORM_MCP_SERVER } from "../../src/mcp/catalog.ts";
import { REGISTRY_URL } from "../../src/shared/cliCall.ts";

/**
 * u6-person-only-tables (REQ-FLOW-102, REQ-FLOW-120): the person-only acts the
 * main thread is refused on every client, and the push rule of an unattended run.
 *
 * Pure module, no filesystem, no git, no process: a command is a string and the
 * branch context is a value, so no double stands in for anything here. Every
 * deny case asserts the rule id, not just `deny: true`, so a rule that fires for
 * the wrong reason fails; every allow case sits beside a deny case one token
 * away, so a verdict that denied everything (or nothing) fails the matrix.
 *
 * The threat this pins: injected item text telling the run to `gh pr merge`,
 * `git push origin HEAD:main`, or a plain `git push` while on `main`, or to push
 * a workflow change around the run verbs. The respelling residuals (an alias, a
 * computed `sh -c "$(…)"`) are asserted ALLOWED below so the gap is written down
 * where it is tested, and named in `SECURITY.md` by u21; the pre-flight's REST
 * check of the default branch is the wall behind this guard.
 */

const ON_FEATURE = { defaultBranches: [], currentBranch: "feat/x", tags: [] } as const;
const ON_MAIN = { defaultBranches: [], currentBranch: "main", tags: [] } as const;
const ON_TRUNK = { defaultBranches: ["trunk"], currentBranch: "trunk", tags: [] } as const;
/** A repository whose local tags include `v1.0.0` (u14 reads them from `refs/tags/` and `packed-refs`). */
const TAGGED = { defaultBranches: [], currentBranch: "feat/x", tags: ["v1.0.0"] } as const;

type Ctx = {
  defaultBranches: readonly string[];
  currentBranch: string | null;
  tags: readonly string[];
  runs?: readonly PersonOnlyRuleId[];
  deployingBranches?: readonly string[];
  stricterThanDefault?: boolean;
  originRepo?: string;
  ghDefaultRepo?: string | null;
  ghHost?: string;
};

const DENY: readonly (readonly [command: string, rule: string, ctx?: Ctx])[] = [
  // force-push
  ["git push -f", "force-push"],
  ["git push --force origin feat/x", "force-push"],
  ["git push --force-with-lease origin feat/x", "force-push"],
  ["git push --force-with-lease=feat/x:abc123 origin feat/x", "force-push"],
  ["git push --force-if-includes origin feat/x", "force-push"],
  ["git push origin +feat/x", "force-push"],
  ["git push origin +HEAD:refs/heads/feat/x", "force-push"],
  ["git push -uf origin feat/x", "force-push"],
  ["git -c a=b push -f", "force-push"],
  ["git -C /tmp/repo push --force origin feat/x", "force-push"],
  ["/usr/bin/git push -f origin feat/x", "force-push"],
  ["GIT_TRACE=1 git push -f origin feat/x", "force-push"],
  ["env GIT_TRACE=1 git push -f origin feat/x", "force-push"],
  ["npm test && git push -f origin feat/x", "force-push"],
  ["npm test || git push --force origin feat/x", "force-push"],
  ["echo ok; git push --force origin feat/x", "force-push"],
  ["echo ok | git push --force origin feat/x", "force-push"],
  ["echo feat/x | xargs git push -f origin", "force-push"],
  ["sudo git push -f origin feat/x", "force-push"],
  ["if true; then git push -f origin feat/x; fi", "force-push"],
  ["echo ok\ngit push --force origin feat/x", "force-push"],
  ["(git push --force origin feat/x)", "force-push"],
  ["echo \"$(git push --force origin feat/x)\"", "force-push"],
  ["sh -c 'git push --force origin feat/x'", "force-push"],
  ["bash -lc \"git push -f origin feat/x\"", "force-push"],
  ["eval git push -f origin feat/x", "force-push"],
  // Literal spellings (review/73): ANSI-C and locale quoting, a wrapper's option values, a command-line option value.
  ["git push $'-f' origin feat/x", "force-push"],
  ["git push $'\\x2df' origin feat/x", "force-push"],
  ["git push $'\\055f' origin feat/x", "force-push"],
  ["git push $\"--force\" origin feat/x", "force-push"],
  ["sudo -u root git push -f origin feat/x", "force-push"],
  ["sudo --user root git push -f origin feat/x", "force-push"],
  ["sudo -nu root git push -f origin feat/x", "force-push"],
  ["env -u GIT_DIR git push -f origin feat/x", "force-push"],
  ["timeout -s KILL 10 git push -f origin feat/x", "force-push"],
  ["nice -n 5 git push -f origin feat/x", "force-push"],
  ["xargs -I {} git push -f origin {}", "force-push"],
  ["time -p git push -f origin feat/x", "force-push"],
  ["env -S 'git push -f origin feat/x'", "force-push"],
  // git's dashed program form, as git's exec path holds it (build/49).
  ["/usr/lib/git-core/git-push -f origin feat/x", "force-push"],
  ["git-push --force origin feat/x", "force-push"],
  // A runner subcommand handed a whole command line as one word (build/51).
  ["bun exec 'git push -f origin feat/x'", "force-push"],
  ["yarn exec 'git push --force origin feat/x'", "force-push"],
  // PowerShell's command string read as its own line (build/89): `-Command` in any prefix, after `-`, `--` or `/`, its
  // value attached or not, `-CommandWithArgs`, a positional command past option values, and `Invoke-Expression`.
  ["pwsh -c 'git push --force origin feat/x'", "force-push"],
  ["pwsh -nop -co git push --force origin feat/x", "force-push"],
  ["powershell.exe -NoProfile -ExecutionPolicy Bypass -Command \"git push --force origin feat/x\"", "force-push"],
  ["'powershell.exe' '-Command' 'git push --force origin feat/x'", "force-push"],
  ["pwsh -Command:'git push --force origin feat/x'", "force-push"],
  ["pwsh --command 'git push --force origin feat/x'", "force-push"],
  ["pwsh -cwa 'git push --force origin feat/x'", "force-push"],
  ["powershell -ExecutionPolicy Bypass -NoProfile 'git push --force origin feat/x'", "force-push"],
  ["Invoke-Expression 'git push --force origin feat/x'", "force-push"],
  ["iex -ErrorAction Stop 'git push --force origin feat/x'", "force-push"],
  // The Windows command interpreter's `/c` and `/k` rest, read as its own line (review/183).
  ["cmd /c git push --force origin feat/x", "force-push"],
  ["CMD.EXE /S /K \"git push --force origin feat/x\"", "force-push"],
  // The lines a git builtin runs, read as their own lines (review/184): `git rebase --exec` or `-x`, `git bisect run`.
  ["git rebase --exec 'git push --force origin feat/x' main", "force-push"],
  ["git rebase -x 'git push --force origin feat/x' main", "force-push"],
  ["git bisect run git push --force origin feat/x", "force-push"],
  // A PowerShell script block, a brace attached to its first and last words (review/185).
  ["Invoke-Command -ScriptBlock {git push --force origin feat/x}", "force-push"],
  // PowerShell's and cmd's text read with a backslash as a plain character, so a Windows-path git reads as `git`, and
  // PowerShell's backtick as its escape (review/194).
  ["pwsh -c 'C:\\Git\\bin\\git.exe push --force origin feat/x'", "force-push"],
  ["cmd /c 'C:\\Git\\bin\\git.exe push --force origin feat/x'", "force-push"],
  ["pwsh -c 'git push `--force origin feat/x'", "force-push"],
  // A POSIX shell line keeps its own escape: `\git` is `git` (review/194).
  ["\\git push --force origin feat/x", "force-push"],
  // A forced ref update over REST or GraphQL (review/76).
  ["gh api -X PATCH repos/o/r/git/refs/heads/feat/x -f sha=abc -F force=true", "force-push"],
  ["curl -X PATCH -d '{\"sha\":\"abc\",\"force\":true}' https://api.github.com/repos/o/r/git/refs/heads/feat/x", "force-push"],
  ["gh api graphql -f query='mutation { updateRef(input: {refId: \"x\", oid: \"abc\", force: true}) { clientMutationId } }'", "force-push"],
  // The batch form forced, and a force the line cannot place (review/108).
  ["gh api graphql -f query='mutation { updateRefs(input: {repositoryId: \"R\", refUpdates: [{name: \"refs/heads/feat/x\", afterOid: \"abc\", force: true}]}) { clientMutationId } }'", "force-push"],
  ["gh api graphql -f query='mutation($f: Boolean) { updateRefs(input: {repositoryId: \"R\", refUpdates: [{name: \"refs/heads/feat/x\", afterOid: \"abc\", force: $f}]}) { clientMutationId } }' -F f=true", "force-push"],
  // A `-c` pair supplying the refspec of a bare push (review/71).
  ["git -c remote.origin.push=+HEAD:refs/heads/main push origin", "force-push"],
  // push-default: named, refs/heads/, <src>:X, configured default, case-folded
  ["git push origin main", "push-default"],
  ["git push origin master", "push-default"],
  ["git push origin HEAD:main", "push-default"],
  ["git push origin HEAD:refs/heads/main", "push-default"],
  ["git push origin feat/x:main", "push-default"],
  ["git push -u origin main", "push-default"],
  ["git push origin 'HEAD:main'", "push-default"],
  ["git push origin \"HEAD\":\"main\"", "push-default"],
  ["git push origin Main", "push-default"],
  ["git push origin trunk", "push-default", { defaultBranches: ["trunk"], currentBranch: "feat/x", tags: [] }],
  ["git push origin trunk", "push-default", { defaultBranches: ["refs/heads/trunk"], currentBranch: "feat/x", tags: [] }],
  ["git push --repo=origin main", "push-default"],
  ["git push origin :", "push-default"],
  ["git -c push.default=matching push", "push-default"],
  ["git -c remote.origin.push=HEAD:refs/heads/main push origin", "push-default"],
  ["git -c push.default=upstream -c branch.feat/x.merge=refs/heads/main push", "push-default"],
  // A `-c` refspec pair git does not apply to this push leaves it refspec-less (review/98).
  ["git -c remote.fork.push=HEAD:refs/heads/feat/x push origin", "push-default", ON_MAIN],
  ["git -c branch.feat/y.merge=refs/heads/feat/y push", "push-default", ON_MAIN],
  ["git -c push.default=matching -c remote.fork.push=refs/heads/feat/x push origin", "push-default"],
  // A pattern refspec matching the default branch (review/67).
  ["git push origin 'refs/heads/*:refs/heads/*'", "push-default"],
  ["git push origin 'refs/heads/*'", "push-default"],
  ["git push origin 'refs/*:refs/*'", "push-default"],
  ["git push origin 'refs/heads/ma*:refs/heads/ma*'", "push-default"],
  ["git push origin 'refs/heads/*:refs/heads/*'", "push-default", ON_TRUNK],
  // `git subtree push` to the default branch (review/74, read attended too).
  ["git subtree push --prefix=dist origin main", "push-default"],
  ["git subtree push -P dist origin main", "push-default"],
  ["git-subtree push -P dist origin main", "push-default"],
  ["yarn exec 'git push origin main'", "push-default"],
  // REST and GraphQL commits or merges landing on the default branch (review/68): named, or no branch given.
  ["gh api -X PUT repos/o/r/contents/.github/workflows/x.yml -f message=m -f content=eA==", "push-default"],
  ["gh api -X PUT repos/o/r/contents/a.md -f message=m -f content=eA== -f branch=main", "push-default"],
  ["gh api -X PUT repos/o/r/contents/a.md -f message=m -f content=eA== -f branch=refs/heads/trunk", "push-default", ON_TRUNK],
  ["gh api -X DELETE repos/o/r/contents/a.md -f message=m -f sha=abc", "push-default"],
  ["gh api -X PUT repos/o/r/contents/a.md --input body.json", "push-default"],
  ["gh api -X PUT repos/o/r/contents/a.md -f message=m -f branch=$B", "push-default"],
  ["curl -X PUT -d '{\"message\":\"m\",\"content\":\"eA==\"}' https://api.github.com/repos/o/r/contents/a.md", "push-default"],
  ["gh api repos/o/r/merges -f base=main -f head=feat/x", "push-default"],
  ["gh api repos/o/r/merges --input m.json", "push-default"],
  ["gh api repos/o/r/merge-upstream -f branch=main", "push-default"],
  [
    "gh api graphql -f query='mutation { createCommitOnBranch(input: {branch: {repositoryNameWithOwner: \"o/r\", branchName: \"main\"}, expectedHeadOid: \"abc\", message: {headline: \"m\"}}) { commit { oid } } }'",
    "push-default",
  ],
  ["gh api graphql -f query='mutation($b: String!) { createCommitOnBranch(input: {branch: {branchName: $b}}) { commit { oid } } }' -f b=feat/x", "push-default"],
  ["gh api graphql -f query='mutation { mergeBranch(input: {repositoryId: \"x\", base: \"main\", head: \"feat/x\"}) { mergeCommit { oid } } }'", "push-default"],
  // A field read only where a field starts (review/99): a decoy inside another field's value, string or selection
  // set names no branch, so the write still lands on the default branch.
  ["gh api -X PUT repos/o/r/contents/a.md -f 'message=fix branch: feat/x' -f content=eA==", "push-default"],
  ["gh api -X PUT repos/o/r/contents/a.md -f message=branch=feat/x -f content=eA==", "push-default"],
  ["gh api -X PUT repos/o/r/contents/a.md -f message=m -f branch=", "push-default"],
  ["curl -X PUT -d '{\"message\":\"the branch: feat/x\",\"content\":\"eA==\"}' https://api.github.com/repos/o/r/contents/a.md", "push-default"],
  ["curl -X PUT -d '{\"message\":\"m\",\"committer\":{\"branch\":\"feat/x\"}}' https://api.github.com/repos/o/r/contents/a.md", "push-default"],
  [
    "gh api graphql -f query='mutation { createCommitOnBranch(input: {branch: {id: \"B\"}, message: {headline: \"branchName: feat/x\"}}) { commit { oid } } }'",
    "push-default",
  ],
  ["gh api graphql -f query='mutation { createCommitOnBranch(input: {branch: {id: \"B\"}}) { branchName: commit { oid } } }'", "push-default"],
  [
    "gh api graphql -f query='mutation { a: createCommitOnBranch(input: {branch: {id: \"B\"}}) { commit { oid } } b: createCommitOnBranch(input: {branch: {branchName: \"feat/x\"}}) { commit { oid } } }'",
    "push-default",
  ],
  ["gh api graphql -f query='mutation { createCommitOnBranch(input: {branch: {branchName: \"\"\"main\"\"\"}}) { commit { oid } } }'", "push-default"],
  ["gh api graphql -f query='mutation { createCommitOnBranch(input: {branch: {branchName: \"ma\\u0069n\"}}) { commit { oid } } }'", "push-default"],
  [
    "curl -X POST -d '{\"query\":\"mutation { createCommitOnBranch(input: {branch: {branchName: \\\"main\\\"}}) { commit { oid } } }\"}' https://api.github.com/graphql",
    "push-default",
  ],
  // A GraphQL ref update onto the default branch, unforced (review/108): the batch form names each ref, the single
  // form names it by id, which the line cannot show.
  [
    "gh api graphql -f query='mutation { updateRefs(input: {repositoryId: \"R\", refUpdates: [{name: \"refs/heads/main\", afterOid: \"abc\"}]}) { clientMutationId } }'",
    "push-default",
  ],
  [
    "gh api graphql -f query='mutation { updateRefs(input: {repositoryId: \"R\", refUpdates: [{name: \"refs/heads/feat/x\", afterOid: \"a\"}, {name: \"refs/heads/trunk\", afterOid: \"b\"}]}) { clientMutationId } }'",
    "push-default",
    ON_TRUNK,
  ],
  // TEST CHANGE (v0a, REQ-FLOW-124): a list or an element given whole as a variable hides its `afterOid`, which now
  // reads as a deletion, so these three move from push-default to the refuse-class push-delete; still denied.
  ["gh api graphql -f query='mutation($u: [RefUpdate!]!) { updateRefs(input: {repositoryId: \"R\", refUpdates: $u}) { clientMutationId } }'", "push-delete"],
  ["gh api graphql -f query='mutation { updateRef(input: {refId: \"x\", oid: \"abc\"}) { clientMutationId } }'", "push-default"],
  // A batch element given whole as a variable, beside a literal feature-branch element, in either order (review/128).
  [
    "gh api graphql -f query='mutation($u: RefUpdate!) { updateRefs(input: {repositoryId: \"R\", refUpdates: [$u, {name: \"refs/heads/feat/x\", afterOid: \"a\"}]}) { clientMutationId } }'",
    "push-delete",
  ],
  [
    "gh api graphql -f query='mutation($u: RefUpdate!) { updateRefs(input: {repositoryId: \"R\", refUpdates: [{name: \"refs/heads/feat/x\", afterOid: \"a\"}, $u]}) { clientMutationId } }'",
    "push-delete",
  ],
  // GraphQL ref creation on the default branch (build/75), the twin of a REST `git/refs` write naming its head.
  ["gh api graphql -f query='mutation { createRef(input: {repositoryId: \"R\", name: \"refs/heads/main\", oid: \"abc\"}) { ref { id } } }'", "push-default"],
  // gh's own conversions (review/127): `{branch}` and `:branch` filled from the checkout, in a typed field and in the
  // endpoint; a checkout on no branch reads as the default branch.
  ["gh api -X PUT repos/o/r/contents/a.md -f message=m -f content=eA== -F branch={branch}", "push-default", ON_MAIN],
  ["gh api -X PUT repos/o/r/contents/a.md -f message=m -f content=eA== --field branch=:branch", "push-default", ON_MAIN],
  ["gh api repos/{owner}/{repo}/merges -F base={branch} -f head=feat/x", "push-default", ON_TRUNK],
  ["gh api -X PATCH repos/{owner}/{repo}/git/refs/heads/{branch} -f sha=abc", "push-default", ON_MAIN],
  ["gh api -X PATCH repos/:owner/:repo/git/refs/heads/:branch -f sha=abc", "push-default", ON_MAIN],
  ["gh api -X PATCH repos/o/r/git/refs/heads/{branch} -f sha=abc", "push-default", { defaultBranches: [], currentBranch: null, tags: [] }],
  [
    "gh api graphql -F query='mutation { createCommitOnBranch(input: {branch: {branchName: \"{branch}\"}}) { commit { oid } } }'",
    "push-default",
    ON_MAIN,
  ],
  // gh's typed `null` is JSON null, read as the denying value as a JSON body's `null` is (review/127).
  ["gh api -X PUT repos/o/r/contents/a.md -f message=m -f content=eA== -F branch=null", "push-default"],
  ["gh api -X PATCH repos/o/r/git/refs/heads/feat/x -f sha=abc -F force=null", "force-push"],
  // A percent-encoded path, decoded as the API reads it (build/76).
  ["gh api -X PATCH repos/o/r/git/refs/heads/ma%69n -f sha=abc", "push-default"],
  ["gh api -X PATCH repos/o/r/git/refs/heads%2Fmain -f sha=abc", "push-default"],
  ["curl -X PATCH -d '{\"sha\":\"abc\"}' https://api.github.com/repos/o/r/git/refs/heads/%6Dain", "push-default"],
  ["pwsh -c 'git push'", "push-default", ON_MAIN],
  // push-default implied: refspec-less, HEAD or @, while on a default branch
  ["git push", "push-default", ON_MAIN],
  ["git push origin", "push-default", ON_MAIN],
  ["git push upstream", "push-default", ON_MAIN],
  ["git push origin HEAD", "push-default", ON_MAIN],
  ["git push origin @", "push-default", ON_MAIN],
  ["git push -u origin HEAD", "push-default", ON_MAIN],
  ["git push", "push-default", ON_TRUNK],
  ["git push > /dev/null 2>&1", "push-default", ON_MAIN],
  ["git push # origin feat/x", "push-default", ON_MAIN],
  // push-tags
  ["git push --tags", "push-tags"],
  ["git push origin --tags", "push-tags"],
  ["git push --follow-tags origin feat/x", "push-tags"],
  // TEST CHANGE (v0a, REQ-FLOW-124): `--mirror` and `remote.*.mirror` also force-update and delete remote refs, so
  // they move from push-tags to the refuse-class force-push; still denied.
  ["git push --mirror", "force-push"],
  ["git push --all origin", "push-tags"],
  // Named forms the table holds, each pinned (review/110).
  ["git push --branches origin", "push-tags"],
  ["git -c remote.origin.mirror=true push origin", "force-push"],
  [
    "gh api graphql -f query='mutation { updateRefs(input: {repositoryId: \"R\", refUpdates: [{name: \"refs/tags/v1\", afterOid: \"abc\"}]}) { clientMutationId } }'",
    "push-tags",
  ],
  // GraphQL tag ref creation, and a created name the line cannot show (build/75): POST `git/refs`'s twins.
  ["gh api graphql -f query='mutation { createRef(input: {repositoryId: \"R\", name: \"refs/tags/v1\", oid: \"abc\"}) { ref { id } } }'", "push-tags"],
  [
    "gh api graphql -f query='mutation($n: String!) { createRef(input: {repositoryId: \"R\", name: $n, oid: \"abc\"}) { ref { id } } }' -f n=refs/tags/v1",
    "push-tags",
  ],
  ["gh api graphql -f query='mutation($i: CreateRefInput!) { createRef(input: $i) { ref { id } } }'", "push-tags"],
  ["git push origin refs/tags/v1.0.0", "push-tags"],
  ["git push origin HEAD:refs/tags/v1.0.0", "push-tags"],
  ["git -c push.followTags=true push origin feat/x", "push-tags"],
  // push-tags by name: a local tag's bare name on either side, `tags/…`, or a tag source with a bare destination
  // (git gives the destination the source's `refs/tags/` namespace, so these create or update a remote tag).
  ["git push origin v1.0.0", "push-tags", TAGGED],
  ["git push origin V1.0.0", "push-tags", TAGGED],
  ["git push origin v1.0.0:x", "push-tags", TAGGED],
  ["git push origin HEAD:v1.0.0", "push-tags", TAGGED],
  ["git push -u origin v1.0.0", "push-tags", TAGGED],
  ["git push origin v1.0.0", "push-tags", { defaultBranches: [], currentBranch: "feat/x", tags: ["refs/tags/v1.0.0"] }],
  ["git push origin tags/v1.0.0", "push-tags"],
  ["git push origin refs/tags/v1.0.0:x", "push-tags"],
  // git's `tag <name>` form, whatever the context lists (review/72), and a configured tag refspec (review/71).
  ["git push origin tag v9", "push-tags"],
  ["git push origin feat/x tag v9", "push-tags"],
  ["git -c remote.origin.push=refs/tags/v1:refs/tags/v1 push", "push-tags"],
  // push-delete
  ["git push origin --delete feat/x", "push-delete"],
  ["git push -d origin feat/x", "push-delete"],
  ["git push origin :feat/x", "push-delete"],
  ["git push origin :refs/heads/feat/x", "push-delete"],
  ["git push --prune origin", "push-delete"],
  // Any GraphQL ref deletion, DELETE `git/refs`'s twin (build/75).
  ["gh api graphql -f query='mutation { deleteRef(input: {refId: \"x\"}) { clientMutationId } }'", "push-delete"],
  // tag
  ["git tag v1.0.0", "tag"],
  ["git tag -a v1.0.0 -m release", "tag"],
  ["git tag -s v1.0.0", "tag"],
  // TEST CHANGE (v0a, REQ-FLOW-124): a tag deleted or moved by force is the refuse-class tag-delete, no longer tag;
  // still denied. The same for the `git update-ref -d` and `git symbolic-ref -d` deletions below.
  ["git tag -d v1.0.0", "tag-delete"],
  ["git tag -f v1.0.0 HEAD", "tag-delete"],
  ["git tag --delete v1.0.0", "tag-delete"],
  ["git tag -l -d v1.0.0", "tag-delete"],
  ["git-tag v1.0.0", "tag"],
  // A tag ref written through `git update-ref` (pr/53): created, deleted, and named in a piped `--stdin` text.
  ["git update-ref refs/tags/v1 HEAD", "tag"],
  ["git update-ref -d refs/tags/v1", "tag-delete"],
  ["printf 'create refs/tags/v1 HEAD\\n' | git update-ref --stdin", "tag"],
  // pr-merge, pr-ready
  ["gh pr merge 3 --squash", "pr-merge"],
  ["gh pr merge --auto --squash", "pr-merge"],
  ["gh pr --repo o/r merge 3", "pr-merge"],
  ["pwsh -NoProfile -Command \"gh pr merge 3\"", "pr-merge"],
  ["Invoke-Expression -Command 'gh pr merge 3'", "pr-merge"],
  ["gh pr ready 3", "pr-ready"],
  ["gh api -X PUT repos/o/r/pulls/3/merge", "pr-merge"],
  ["gh api --method=PUT /repos/o/r/pulls/3/merge -f merge_method=squash", "pr-merge"],
  ["curl -X PUT -H 'Authorization: token x' https://api.github.com/repos/o/r/pulls/3/merge", "pr-merge"],
  ["curl -XPUT https://api.github.com/repos/o/r/pulls/3/merge", "pr-merge"],
  ["wget --method=PUT https://api.github.com/repos/o/r/pulls/3/merge", "pr-merge"],
  ["gh api -X POST repos/o/r/pulls/3/merge-async", "pr-merge"],
  ["gh api graphql -f query='mutation { mergePullRequest(input: {pullRequestId: \"x\"}) { clientMutationId } }'", "pr-merge"],
  ["gh api graphql -f query='mutation { enablePullRequestAutoMerge(input: {pullRequestId: \"x\"}) { clientMutationId } }'", "pr-merge"],
  // A pull request added to the merge queue, which merges it later (pr/57).
  ["gh api graphql -f query='mutation { enqueuePullRequest(input: {pullRequestId: \"x\"}) { mergeQueueEntry { id } } }'", "pr-merge"],
  ["gh api graphql -f query='mutation { markPullRequestReadyForReview(input: {pullRequestId: \"x\"}) { clientMutationId } }'", "pr-ready"],
  // release
  ["gh release create v1.0.0", "release"],
  // TEST CHANGE (v0a, REQ-FLOW-124): a release deletion is the refuse-class release-delete; still denied.
  ["gh release delete v1.0.0 --yes", "release-delete"],
  ["gh release edit v1.0.0 --draft=false", "release"],
  ["gh release upload v1.0.0 dist.tgz", "release"],
  ["gh api -X POST repos/o/r/releases -f tag_name=v1", "release"],
  // publish
  ["npm publish", "publish"],
  ["npm publish --access public", "publish"],
  ["npm --registry https://registry.npmjs.org publish", "publish"],
  // Through a package runner (review/73).
  ["npx npm publish", "publish"],
  ["npx -y npm publish", "publish"],
  ["npx --package npm npm publish", "publish"],
  ["npx -c 'npm publish'", "publish"],
  ["npm exec -- npm publish", "publish"],
  ["npm exec -c 'npm publish'", "publish"],
  ["npm x npm publish", "publish"],
  ["pnpm dlx npm publish", "publish"],
  ["pnpm exec npm publish", "publish"],
  ["yarn dlx npm publish", "publish"],
  ["bunx npm publish", "publish"],
  ["bun x npm publish", "publish"],
  ["pnpm publish", "publish"],
  ["yarn publish", "publish"],
  ["yarn npm publish", "publish"],
  ["bun publish", "publish"],
  ["bun publish --access public", "publish"],
  ["yarn exec 'npm publish'", "publish"],
  ["bun exec 'npm publish --access public'", "publish"],
  ["iex 'npm publish'", "publish"],
  ["pwsh /c 'npm publish'", "publish"],
  // npm's unique prefixes of `publish` (pr/50), directly and through a runner, and a `--<key> <value>` setting
  // before the subcommand; a boolean option before it still reads the next word as the subcommand.
  ["npm pub", "publish"],
  ["npm pu", "publish"],
  ["npm publ --access public", "publish"],
  ["npx npm pub", "publish"],
  ["npm exec -- npm pub", "publish"],
  ["npm --loglevel silly publish", "publish"],
  ["npm --loglevel silly pub", "publish"],
  ["npm --json publish", "publish"],
  // A boolean option after a setting (pr/66): the settings reading never takes `publish` or its prefix as a value. A
  // single-dash setting npm reads as its long name or as a valued short option, and a setting that takes `run` as its
  // value, which `--json` does not.
  ["npm --loglevel silly --json publish", "publish"],
  ["npm --loglevel silly --no-color pub", "publish"],
  ["npm -loglevel silly publish", "publish"],
  ["npm -c run publish", "publish"],
  ["npm --cache run publish", "publish"],
  // Corepack in front of a package manager, and a manager word carrying its version (pr/51).
  ["corepack pnpm publish", "publish"],
  ["corepack yarn npm publish", "publish"],
  ["corepack pnpm@9.1.0 publish", "publish"],
  ["npx npm@10 publish", "publish"],
  // secrets
  // TEST CHANGE (v0a, REQ-FLOW-124): each deletion below moves to its refuse-class rule (secrets-delete,
  // protection-delete, repo-delete), a visibility change or a transfer to repo-irreversible; every row stays denied.
  ["gh secret set TOKEN --body x", "secrets"],
  ["gh secret delete TOKEN", "secrets-delete"],
  ["gh variable set NAME --body x", "secrets"],
  ["gh variable delete NAME", "secrets-delete"],
  ["gh api -X PUT repos/o/r/actions/secrets/TOKEN -f encrypted_value=x", "secrets"],
  ["gh api -X DELETE repos/o/r/actions/variables/NAME", "secrets-delete"],
  ["gh api repos/o/r/actions/variables -f name=N -f value=v", "secrets"],
  ["gh api -X PUT repos/o/r/environments/prod/secrets/TOKEN", "secrets"],
  // protection
  ["gh api -X PUT repos/o/r/branches/main/protection --input p.json", "protection"],
  ["gh api -X DELETE repos/o/r/branches/main/protection", "protection-delete"],
  ["gh api -X POST repos/o/r/rulesets --input r.json", "protection"],
  ["gh api -X DELETE repos/o/r/rulesets/7", "protection-delete"],
  ["curl -X PUT https://api.github.com/repos/o/r/branches/release/v2/protection", "protection"],
  // the repository itself: its default branch, deleting or archiving it
  ["gh repo edit --default-branch trunk", "protection"],
  ["gh repo edit o/r --default-branch=trunk", "protection"],
  ["gh repo delete o/r --yes", "repo-delete"],
  ["gh repo archive o/r --yes", "protection"],
  // Its visibility and name, and the REST twins on the repository's own path (review/69, build/31).
  ["gh repo edit --description 'x'", "protection"],
  ["gh repo edit --description 'x' --homepage https://x.dev", "protection"],
  ["gh repo edit --visibility public --accept-visibility-change-consequences", "repo-irreversible"],
  ["gh repo edit o/r --visibility=private", "repo-irreversible"],
  ["gh repo rename new-name", "protection"],
  ["gh repo rename new-name -R o/r --yes", "protection"],
  ["gh api -X PATCH repos/o/r -f default_branch=x", "protection"],
  ["gh api -X PATCH /repos/o/r/ -f private=false", "repo-irreversible"],
  ["gh api -X DELETE repos/o/r", "repo-delete"],
  ["curl -X PATCH -d '{\"visibility\":\"public\"}' https://api.github.com/repos/o/r", "repo-irreversible"],
  ["gh api -X PATCH repositories/123 -f archived=true", "protection"],
  // The branch-rename endpoint (the 23:20Z sign-off with review/60).
  ["gh api -X POST repos/o/r/branches/main/rename -f new_name=trunk", "protection"],
  ["gh api repos/o/r/branches/feat/x/rename -f new_name=y", "protection"],
  // A repository transfer (the 23:34Z sign-off): the REST form and a gh CLI form.
  ["gh api -X POST repos/o/r/transfer -f new_owner=other", "repo-irreversible"],
  ["gh api repos/o/r/transfer -f new_owner=other", "repo-irreversible"],
  ["curl -X POST -d '{\"new_owner\":\"other\"}' https://api.github.com/repos/o/r/transfer", "repo-irreversible"],
  ["gh api -X POST repositories/123/transfer -f new_owner=other", "repo-irreversible"],
  ["gh repo transfer o/r other --yes", "repo-irreversible"],
  // REST respellings of a push
  ["gh api -X PATCH repos/o/r/git/refs/heads/main -f sha=abc", "push-default"],
  // The path's own ref read from the path as routing reads it: a query, a fragment or a trailing slash (review/107).
  ["gh api -X PATCH 'repos/o/r/git/refs/heads/main?x=1' -f sha=abc", "push-default"],
  ["gh api -X PATCH repos/o/r/git/refs/heads/main#x -f sha=abc", "push-default"],
  ["gh api -X PATCH repos/o/r/git/refs/heads/main/ -f sha=abc", "push-default"],
  ["curl -X PATCH -d '{\"sha\":\"abc\"}' 'https://api.github.com/repos/o/r/git/refs/heads/main?ref=1'", "push-default"],
  ["gh api repos/o/r/git/refs -f ref=refs/tags/v1 -f sha=abc", "push-tags"],
  ["gh api -X DELETE repos/o/r/git/refs/heads/feat/x", "push-delete"],
  // gh's close with its delete-branch flag deletes the head branch on the remote, as the REST DELETE above (review/207,
  // read from gh 2.102.0's help: `-d, --delete-branch`, `-c, --comment string`).
  ["gh pr close 3 --delete-branch", "push-delete"],
  ["gh pr close 3 --delete-branch=true", "push-delete"],
  ["gh pr close 3 -d", "push-delete"],
  ["gh pr close -d feat/x", "push-delete"],
  ["gh -R o/r pr close 3 -dc done", "push-delete"],
  // Approving a review counts toward a required review (review/210): gh's flag (`-a, --approve`; `-b` and `-F` take a
  // value), the REST review and the submit of a pending one with the event APPROVE, an event the line cannot place,
  // and the GraphQL review mutations.
  ["gh pr review 3 --approve", "pr-merge"],
  ["gh pr review --approve=true", "pr-merge"],
  ["gh pr review -a", "pr-merge"],
  ["gh pr review 3 -ab lgtm", "pr-merge"],
  ["gh api repos/o/r/pulls/3/reviews -f event=APPROVE", "pr-merge"],
  ["gh api -X POST repos/o/r/pulls/3/reviews -F event=approve -f body=lgtm", "pr-merge"],
  ["gh api repos/o/r/pulls/3/reviews/9/events -f event=APPROVE", "pr-merge"],
  ["gh api repos/o/r/pulls/3/reviews -f event=$EVENT", "pr-merge"],
  ["curl -X POST -d '{\"event\":\"APPROVE\"}' https://api.github.com/repos/o/r/pulls/3/reviews", "pr-merge"],
  // A REST review whose body the line cannot show reads as an approval, as on GraphQL (review/228): gh's `--input` file
  // or stdin, a typed field read from a file or stdin, and curl's and wget's body files, stdin, uploads and computed
  // bodies, in every mode.
  ["gh api -X POST repos/o/r/pulls/3/reviews --input r.json", "pr-merge"],
  ["gh api repos/o/r/pulls/3/reviews --input -", "pr-merge"],
  ["gh api repos/o/r/pulls/3/reviews/9/events --input=r.json", "pr-merge"],
  ["gh api repos/o/r/pulls/3/reviews -F body=@r.md", "pr-merge"],
  ["gh api repos/o/r/pulls/3/reviews -f event=COMMENT --field body=@-", "pr-merge"],
  ["curl -X POST -d @r.json https://api.github.com/repos/o/r/pulls/3/reviews", "pr-merge"],
  ["curl --data-binary @r.json https://api.github.com/repos/o/r/pulls/3/reviews", "pr-merge"],
  ["curl -sd @- https://api.github.com/repos/o/r/pulls/3/reviews", "pr-merge"],
  ["curl -d \"$BODY\" https://api.github.com/repos/o/r/pulls/3/reviews", "pr-merge"],
  ["curl -X POST -T r.json https://api.github.com/repos/o/r/pulls/3/reviews", "pr-merge"],
  ["curl -d '{\"body\":\"x\"}' -d @r.json https://api.github.com/repos/o/r/pulls/3/reviews", "pr-merge"],
  ["wget --post-file=r.json https://api.github.com/repos/o/r/pulls/3/reviews", "pr-merge"],
  ["gh api graphql -f query='mutation { addPullRequestReview(input: {pullRequestId: \"PR_1\", event: APPROVE}) { clientMutationId } }'", "pr-merge"],
  ["gh api graphql -f query='mutation { submitPullRequestReview(input: {pullRequestReviewId: \"R_1\", event: APPROVE}) { clientMutationId } }'", "pr-merge"],
  ["gh api graphql -f query='mutation($e: PullRequestReviewEvent!) { submitPullRequestReview(input: {pullRequestReviewId: \"R_1\", event: $e}) { clientMutationId } }' -f e=APPROVE", "pr-merge"],
  ["gh api graphql -f query='mutation($i: AddPullRequestReviewInput!) { addPullRequestReview(input: $i) { clientMutationId } }'", "pr-merge"],
  // PR #112's resolution round 1. A `git/refs` write's parsed `ref` field, a JSON body's quote before it among the
  // spellings, one the line cannot place reading as a tag (pr/1).
  ["curl -X POST -d '{\"ref\":\"refs/tags/v2\",\"sha\":\"abc\"}' https://api.github.com/repos/o/r/git/refs", "push-tags"],
  ["curl -X POST --json '{\"ref\":\"refs/tags/v2\",\"sha\":\"abc\"}' https://api.github.com/repos/o/r/git/refs", "push-tags"],
  ["wget --post-data='{\"ref\":\"refs/tags/v2\",\"sha\":\"abc\"}' https://api.github.com/repos/o/r/git/refs", "push-tags"],
  ["curl -X POST -d '{\"ref\":\"$REF\",\"sha\":\"abc\"}' https://api.github.com/repos/o/r/git/refs", "push-tags"],
  ["curl -X POST -d '{\"ref\":\"refs/heads/main\",\"sha\":\"abc\"}' https://api.github.com/repos/o/r/git/refs", "push-default"],
  // A package manager's options before a runner's subcommand, and a `publish` after a package manager's word or yarn's
  // `workspace <name>` (pr/3).
  ["npm --workspace mypkg exec -- npm publish", "publish"],
  ["pnpm --filter mypkg exec npm publish", "publish"],
  ["yarn workspace mypkg npm publish", "publish"],
  ["yarn workspace mypkg publish", "publish"],
  ["npm -w x exec -- git push --force origin feat/x", "force-push"],
  ["pnpm --filter x exec git push origin main", "push-default"],
  ["yarn workspace x exec git push -f origin feat/x", "force-push"],
  ["npm --loglevel silly exec -- git push --force origin feat/x", "force-push"],
  ["npm --force publish", "publish"],
  // git push's options as the unique prefixes git reads (pr/9), a valued one's value skipped.
  ["git push --force-w origin feat/x", "force-push"],
  ["git push --del origin feat/x", "push-delete"],
  // TEST CHANGE (v0a, REQ-FLOW-124): `--mir` is `--mirror`'s prefix, now the refuse-class force-push; still denied.
  ["git push --mir", "force-push"],
  ["git push --follow-t origin feat/x", "push-tags"],
  ["git push --rep=origin main", "push-default"],
  ["git push --push-o ci.skip origin", "push-default", ON_MAIN],
  // The Windows command interpreter's caret escape (pr/10), in an option and in the program word.
  ["cmd /c git push --for^ce origin feat/x", "force-push"],
  ["cmd /c git push --del^ete origin feat/x", "push-delete"],
  ["cmd /c g^it push --force origin feat/x", "force-push"],
  // wget's method and body options as the unique prefixes wget reads (pr/11).
  ["wget --meth=DELETE https://api.github.com/repos/o/r/git/refs/heads/feat/x", "push-delete"],
  // TEST CHANGE (v0a, REQ-FLOW-124): a REST DELETE on a release is the refuse-class release-delete, here and in the
  // `--execute=method=DELETE` and `--ur … --req DELETE` rows below; each stays denied.
  ["wget --meth DELETE https://api.github.com/repos/o/r/releases/1", "release-delete"],
  ["wget --post-d '{\"event\":\"APPROVE\"}' https://api.github.com/repos/o/r/pulls/3/reviews", "pr-merge"],
  ["wget --body-f=r.json --meth=POST https://api.github.com/repos/o/r/pulls/3/reviews", "pr-merge"],
  // The two-letter prefix, `--method` where wget has no metalink options (pr/29).
  ["wget --me DELETE https://api.github.com/repos/o/r/git/refs/heads/feat/x", "push-delete"],
  // wget's `-e`/`--execute` run as wgetrc commands (pr/23): `method` sets the method, the body commands send a body.
  ["wget -e method=DELETE https://api.github.com/repos/o/r/git/refs/heads/feat/x", "push-delete"],
  ["wget --execute=method=DELETE https://api.github.com/repos/o/r/releases/1", "release-delete"],
  ["wget --exec 'Method = PUT' https://api.github.com/repos/o/r/pulls/3/merge", "pr-merge"],
  ["wget -qemethod=PUT https://api.github.com/repos/o/r/pulls/3/merge", "pr-merge"],
  ["wget -e 'body_data={\"event\":\"APPROVE\"}' https://api.github.com/repos/o/r/pulls/3/reviews", "pr-merge"],
  ["wget -e post_file=r.json https://api.github.com/repos/o/r/pulls/3/reviews", "pr-merge"],
  ["wget -e POST-DATA='{\"ref\":\"refs/tags/v2\",\"sha\":\"abc\"}' https://api.github.com/repos/o/r/git/refs", "push-tags"],
  ["wget -e body_file=r.json -e method=POST https://api.github.com/repos/o/r/pulls/3/reviews", "pr-merge"],
  // `git send-pack`, read as a push, no ref reading as a matching push (pr/16).
  ["git send-pack --force git@github.com:o/r.git feat/x", "force-push"],
  ["git send-pack git@github.com:o/r.git main", "push-default"],
  ["git send-pack git@github.com:o/r.git refs/tags/v1", "push-tags"],
  ["git send-pack git@github.com:o/r.git", "push-default"],
  ["git-send-pack -f git@github.com:o/r.git feat/x", "force-push"],
  // PR #112's resolution round 4. `git symbolic-ref` (pr/70): a tag's name written or deleted, and a ref pointed at
  // the default branch, named or one the line cannot show, whatever namespace the new name is in, since a push of that
  // name sends the default branch.
  ["git symbolic-ref refs/heads/safe refs/heads/main && git push origin safe", "push-default"],
  ["git symbolic-ref refs/heads/safe main", "push-default"],
  ["git symbolic-ref -m why refs/heads/safe refs/heads/master", "push-default"],
  ["git symbolic-ref refs/heads/safe refs/heads/trunk", "push-default", ON_TRUNK],
  ["git symbolic-ref refs/heads/safe \"refs/heads/$B\"", "push-default"],
  ["git symbolic-ref refs/heads/safe \"refs/heads/$(git config init.defaultBranch)\"", "push-default"],
  ["git symbolic-ref refs/remotes/origin/safe refs/heads/main", "push-default"],
  ["git symbolic-ref refs/tags/v9 refs/heads/feat/x", "tag"],
  // TEST CHANGE (v0a, REQ-FLOW-124): a symbolic tag ref deleted is the refuse-class tag-delete; still denied.
  ["git symbolic-ref -d refs/tags/v9", "tag-delete"],
  ["git symbolic-ref --delete -q refs/tags/v9", "tag-delete"],
  ["git symbolic-ref -qd refs/tags/v9", "tag-delete"],
  // curl's `--next` and `-:` start a request of their own, its method and body reset (pr/72): each is judged alone.
  ["curl -X DELETE https://api.github.com/repos/o/r/git/refs/heads/feat --next -X GET https://example.com", "push-delete"],
  ["curl -X DELETE https://api.github.com/repos/o/r/git/refs/heads/feat -: -X GET https://example.com", "push-delete"],
  ["curl https://example.com --next -X PUT https://api.github.com/repos/o/r/pulls/3/merge", "pr-merge"],
  // GraphQL's repository settings, protection and ruleset writes (pr/74), the twins of the REST ones refused above.
  ...[
    "archiveRepository",
    "unarchiveRepository",
    "updateRepository",
    "updateRepositoryCustomProperty",
    "updateRepositoryRuleset",
    "updateRepositoryWebCommitSignoffSetting",
    "createBranchProtectionRule",
    "updateBranchProtectionRule",
    "deleteBranchProtectionRule",
    "createRepositoryRuleset",
    "deleteRepositoryRuleset",
    // TEST CHANGE (v0a, REQ-FLOW-124): a deletion among these names (and `deleteRepositoryCustomProperty` and the
    // REST DELETE on a property's schema below) is the refuse-class protection-delete; each stays denied.
  ].map((name) => [`gh api graphql -f query='mutation { ${name}(input: {repositoryId: "R"}) { clientMutationId } }'`, name.startsWith("delete") ? "protection-delete" : "protection"] as const),
  [
    "curl -X POST -d '{\"query\":\"mutation { archiveRepository(input: {repositoryId: \\\"R\\\"}) { clientMutationId } }\"}' https://api.github.com/graphql",
    "protection",
  ],
  // A custom property's value or definition written (pr/80): an organisation ruleset can target repositories by it, so
  // the write can take this repository out of a ruleset's protection. GraphQL and REST.
  ...["setRepositoryCustomPropertyValues", "createRepositoryCustomProperty", "deleteRepositoryCustomProperty", "promoteRepositoryCustomProperty"]
    .flatMap((name) => [
      [`gh api graphql -f query='mutation { ${name}(input: {}) { clientMutationId } }'`, name.startsWith("delete") ? "protection-delete" : "protection"] as const,
      [`curl -X POST -d '{"query":"mutation { ${name}(input: {}) { clientMutationId } }"}' https://api.github.com/graphql`, name.startsWith("delete") ? "protection-delete" : "protection"] as const,
    ]),
  ["gh api -X PATCH repos/o/r/properties/values", "protection"],
  ["gh api orgs/o/properties/values -F 'repository_names[]=r'", "protection"],
  ["gh api -X DELETE orgs/o/properties/schema/team", "protection-delete"],
  ["curl -X PUT -d '{}' https://api.github.com/enterprises/e/properties/schema/team", "protection"],
  // curl's body letter with its value attached, or as a short cluster's first value letter, the value attached or the
  // next word (pr/81): a body, so the default POST, read as the spaced form is.
  ["curl -d@./review.json https://api.github.com/repos/o/r/pulls/3/reviews", "pr-merge"],
  ["curl -d'{\"ref\":\"refs/tags/v1\",\"sha\":\"a\"}' https://api.github.com/repos/o/r/git/refs", "push-tags"],
  ["curl -d'{\"sha\":\"a\",\"force\":true}' https://api.github.com/repos/o/r/git/refs/heads/main", "force-push"],
  ["curl -d'{}' https://api.github.com/repos/o/r/pulls/3/merge", "pr-merge"],
  ["curl -sd@./r.json https://api.github.com/repos/o/r/pulls/3/reviews", "pr-merge"],
  ["curl -sdevent=APPROVE https://api.github.com/repos/o/r/pulls/3/reviews", "pr-merge"],
  ["curl -Fevent=APPROVE https://api.github.com/repos/o/r/pulls/3/reviews", "pr-merge"],
  ["curl -Tr.json https://api.github.com/repos/o/r/pulls/3/reviews", "pr-merge"],
  ["curl -d@./r.json https://api.github.com/repos/o/r/releases", "release"],
  // `git update-ref --stdin`'s symref commands (git 2.46) in a text the line carries (pr/82), by `git symbolic-ref`'s
  // rules: a ref pointed at the default branch, named or one the line cannot show, a tag's name written.
  ["printf 'symref-create refs/heads/safe refs/heads/main\\n' | git update-ref --stdin", "push-default"],
  ["git update-ref --stdin <<EOF\nsymref-create refs/heads/safe refs/heads/main\nEOF", "push-default"],
  ["printf 'symref-update refs/heads/safe refs/heads/main\\n' | git update-ref --stdin", "push-default"],
  ["echo 'symref-create refs/heads/safe main' | git update-ref --stdin", "push-default"],
  ["printf 'symref-create refs/heads/safe refs/heads/trunk\\n' | git update-ref --stdin", "push-default", ON_TRUNK],
  ["printf \"symref-create refs/heads/safe $B\\n\" | git update-ref --stdin", "push-default"],
  ["printf 'symref-create refs/heads/safe refs/heads/%s\\n' \"$B\" | git update-ref --stdin", "push-default"],
  ["printf 'symref-create refs/heads/safe\\0refs/heads/main\\0' | git update-ref -z --stdin", "push-default"],
  ["printf 'symref-create refs/tags/v9 refs/heads/feat\\n' | git update-ref --stdin", "tag"],
  // PR #112's resolution round 4d. A symref command after another in the same text (pr/82): the line break between them
  // spelled as an escape (`\n`, `\0` with `-z`, `\x0a`, `\012`, `\x00`), by `echo -e`, in ANSI-C quoting or through a `%b`
  // placeholder; and the words of one ended by a Unicode or a four-digit octal escape.
  ["printf 'verify refs/heads/x HEAD\\nsymref-create refs/heads/safe refs/heads/main\\n' | git update-ref --stdin", "push-default"],
  ["printf 'update refs/heads/x\\0HEAD\\0\\0symref-create refs/heads/safe\\0refs/heads/main\\0' | git update-ref -z --stdin", "push-default"],
  ["printf 'verify refs/heads/x HEAD\\x0asymref-update refs/heads/safe refs/heads/main\\n' | git update-ref --stdin", "push-default"],
  ["printf 'verify refs/heads/x HEAD\\012symref-create refs/heads/safe main\\n' | git update-ref --stdin", "push-default"],
  ["printf 'update refs/heads/x\\x00HEAD\\x00\\x00symref-create refs/heads/safe\\x00refs/heads/main\\x00' | git update-ref -z --stdin", "push-default"],
  ["echo -e 'verify refs/heads/x HEAD\\nsymref-create refs/heads/safe refs/heads/main' | git update-ref --stdin", "push-default"],
  ["git update-ref --stdin <<< $'verify refs/heads/x HEAD\\nsymref-create refs/heads/safe refs/heads/main'", "push-default"],
  ["printf '%bsymref-create refs/heads/safe refs/heads/main\\n' 'verify refs/heads/x HEAD\\n' | git update-ref --stdin", "push-default"],
  ["printf 'symref-create\\u0020refs/heads/safe\\u0020refs/heads/main\\n' | git update-ref --stdin", "push-default"],
  ["echo -e 'symref-create\\0040refs/heads/safe\\0040refs/heads/main' | git update-ref --stdin", "push-default"],
  // A short cluster's method read whatever it holds (pr/83): curl's output file named `X` is no method, gh's `-i`
  // clusters with `-X` or a field, and gh's flag parser reads `-X=<method>` and `-F=<field>` as the value after `=`.
  ["curl -oX -X DELETE https://api.github.com/repos/o/r/git/refs/heads/feat", "push-delete"],
  ["curl -oX https://api.github.com/repos/o/r/git/refs/heads/feat -X DELETE", "push-delete"],
  // A body letter after another value letter is that letter's value too, and wget's `-d` (debug) is no body: neither
  // takes the next word as a body's.
  ["curl -oXd https://api.github.com/repos/o/r/git/refs/heads/feat -X DELETE", "push-delete"],
  ["curl -od -X DELETE https://api.github.com/repos/o/r/git/refs/heads/feat", "push-delete"],
  ["curl -HT -X DELETE https://api.github.com/repos/o/r/git/refs/heads/feat", "push-delete"],
  ["wget -qd https://api.github.com/repos/o/r/git/refs/heads/feat --method=DELETE", "push-delete"],
  ["gh api -iXDELETE repos/o/r/git/refs/heads/feat", "push-delete"],
  ["gh api -iX DELETE repos/o/r/git/refs/heads/feat", "push-delete"],
  ["gh api -X=DELETE repos/o/r/git/refs/heads/feat", "push-delete"],
  ["gh api -iX=PUT repos/o/r/pulls/3/merge", "pr-merge"],
  ["gh api repos/o/r/pulls/3/reviews -iFevent=APPROVE", "pr-merge"],
  ["gh api repos/o/r/pulls/3/reviews -F=event=APPROVE", "pr-merge"],
  // curl's long options as the unique prefixes its 7.x line reads, as wget's are (pr/84): the method, a body in each of
  // its forms, an upload, `--next` and `--url`. A prefix curl finds ambiguous (`--dat`, `--req`) is one it refuses.
  ["curl --req DELETE https://api.github.com/repos/o/r/git/refs/heads/feat", "push-delete"],
  ["curl --dat '{}' https://api.github.com/repos/o/r/pulls/3/merge", "pr-merge"],
  ["curl --upl f https://api.github.com/repos/o/r/pulls/3/reviews", "pr-merge"],
  ["curl --data-r '{\"event\":\"APPROVE\"}' https://api.github.com/repos/o/r/pulls/3/reviews", "pr-merge"],
  ["curl --data-bin @r.json https://api.github.com/repos/o/r/pulls/3/reviews", "pr-merge"],
  ["curl --data-asc '{}' https://api.github.com/repos/o/r/pulls/3/merge", "pr-merge"],
  ["curl --data-url event=APPROVE https://api.github.com/repos/o/r/pulls/3/reviews", "pr-merge"],
  ["curl --js '{\"ref\":\"refs/tags/v2\",\"sha\":\"abc\"}' https://api.github.com/repos/o/r/git/refs", "push-tags"],
  ["curl --fo event=APPROVE https://api.github.com/repos/o/r/pulls/3/reviews", "pr-merge"],
  ["curl --form-s event=APPROVE https://api.github.com/repos/o/r/pulls/3/reviews", "pr-merge"],
  ["curl -X DELETE https://api.github.com/repos/o/r/git/refs/heads/feat --nex -X GET https://example.com", "push-delete"],
  ["curl --ur https://api.github.com/repos/o/r/releases/1 --req DELETE", "release-delete"],
  // PR #112's resolution round 5. A path read with its dot segments resolved as well as written, as curl sends it
  // (pr/93): a ref deletion through `..` and through `.`, the default branch's ref, the repository path climbing out of
  // another repository's, a `..` past the end, percent-encoded dots, wget's and a GHES `api/v3/` path, a merge and
  // GraphQL.
  ["curl -X DELETE https://api.github.com/repos/o/r/tmp/../git/refs/heads/feature", "push-delete"],
  ["curl -X DELETE https://api.github.com/repos/o/r/./git/refs/heads/feature", "push-delete"],
  ["gh api -X PATCH repos/o/r/x/../git/refs/heads/main -f sha=abc", "push-default"],
  ["gh api -X PATCH repos/x/y/../../o/r -f archived=true", "protection"],
  ["gh api -X PATCH repos/o/r/git/refs/heads/main/x/.. -f sha=abc", "push-default"],
  ["gh api -X DELETE repos/o/r/tmp/%2e%2e/git/refs/heads/feat", "push-delete"],
  ["wget --method=DELETE https://api.github.com/repos/o/r/a/b/../../git/refs/heads/feat", "push-delete"],
  ["curl -X DELETE https://ghe.example/x/../api/v3/repos/o/r/git/refs/heads/feat", "push-delete"],
  ["gh api -X PUT repos/o/r/x/../pulls/3/merge", "pr-merge"],
  ["gh api x/../graphql -f query='mutation { mergePullRequest(input: {pullRequestId: \"x\"}) { clientMutationId } }'", "pr-merge"],
  // `gh repo sync` onto a named repository (pr/94): no branch, a default branch or one the line cannot show is the
  // default branch's update, `--force` its hard reset; the branch and source values skipped when finding the repository.
  ["gh repo sync o/r", "push-default"],
  ["gh repo sync o/r --branch main", "push-default"],
  ["gh repo sync o/r -b master", "push-default"],
  ["gh repo sync o/r --branch=main", "push-default"],
  ["gh repo sync o/r -bmain", "push-default"],
  ["gh repo sync -b main o/r", "push-default"],
  ["gh repo sync o/r --branch \"$B\"", "push-default"],
  ["gh repo sync o/r --branch `cat b`", "push-default"],
  ["gh repo sync o/r --source up/r", "push-default"],
  ["gh repo sync o/r -b trunk", "push-default", ON_TRUNK],
  ["gh repo sync o/r --force", "force-push"],
  ["gh repo sync o/r --force --branch feat/x", "force-push"],
  ["gh repo sync -s up/r o/r -b feat/x --force", "force-push"],
  // `gh repo unarchive`, the twin of `archive` and of the GraphQL and REST unarchive (pr/96).
  ["gh repo unarchive o/r --yes", "protection"],
  ["gh repo unarchive", "protection"],
  ["gh repo unarchive -R o/r --yes", "protection"],
  // REQ-FLOW-134 (a4c): a comment on another repository, read against the origin `acme/app`.
  ["gh pr comment 3 --body x -R other/repo", "outside-write", { ...ON_FEATURE, originRepo: "github.com/acme/app" }],
  // REQ-FLOW-134 (review/129): a remote's URL changed, which moves the origin later writes are held to.
  ["git remote set-url origin https://github.com/other/repo.git", "remote-write", { ...ON_FEATURE, originRepo: "github.com/acme/app" }],
];

const ALLOW: readonly (readonly [command: string, ctx?: Ctx])[] = [
  ["git push origin HEAD:refs/heads/stamity/2026-10-16_x"],
  ["git push origin HEAD:refs/heads/stamity/2026-10-16_x", ON_MAIN],
  ["git push -u origin feat/x"],
  ["git push origin feat/x"],
  ["git push origin main-feature"],
  ["git push origin feat/main"],
  ["git push origin main:feat/x"],
  // A pattern whose prefix cannot match a default branch.
  ["git push origin 'refs/heads/feat/*:refs/heads/feat/*'"],
  ["git push origin 'refs/heads/*:refs/remotes/fork/*'"],
  // A `-c` refspec to a feature branch, and a line refspec, which git takes over the configured one.
  ["git -c remote.origin.push=HEAD:refs/heads/feat/x push origin"],
  ["git -c remote.origin.push=HEAD:refs/heads/main push origin feat/x"],
  // review/98's twins: the same unapplied pairs on a feature branch, and a mirror pair switched off.
  ["git -c remote.fork.push=HEAD:refs/heads/feat/x push origin"],
  ["git -c branch.feat/y.merge=refs/heads/feat/y push"],
  ["git -c remote.origin.mirror=false push origin feat/x"],
  ["git push origin branches"],
  ["git push origin tagged-feature"],
  ["git subtree push --prefix=dist origin gh-pages"],
  ["git subtree split --prefix=dist"],
  // A branch shaped like a tag, when no local tag has its name.
  ["git push origin v2.0.0", TAGGED],
  ["git push origin feat/x", TAGGED],
  ["git push"],
  ["git push origin"],
  ["git push origin HEAD"],
  ["git push origin @"],
  ["git push --no-force-with-lease origin feat/x"],
  ["git push --no-follow-tags origin feat/x"],
  ["git push -o ci.skip origin feat/x"],
  ["git -c push.followTags=false push origin feat/x"],
  ["git push", { defaultBranches: [], currentBranch: null, tags: [] }],
  ["git tag"],
  ["git tag -l"],
  ["git tag --list 'v1.*'"],
  ["git tag -l 'v*'"],
  ["git tag -n"],
  ["git tag --contains abc123"],
  ["git tag --points-at HEAD"],
  ["git tag --sort=-creatordate"],
  ["gh pr view 3"],
  ["gh pr create --draft --title t --body-file b.md"],
  ["gh pr list"],
  ["gh release view v1.0.0"],
  ["gh release list"],
  ["gh release download v1.0.0"],
  ["gh secret list"],
  ["gh variable list"],
  // A variable read (build/9): `gh variable get` prints a value, writing nothing.
  ["gh variable get NAME"],
  ["npm test"],
  ["npm run publish-docs"],
  ["npm pack"],
  // pr/50's twins: npm's other `p` commands, a script named `pub`, another manager's `pub` (a script), and a setting
  // before `run`. pr/51's: Corepack's own commands and a manager it runs that publishes nothing. pr/53's: a branch ref
  // written. pr/57's: the merge queue read.
  ["npm prune"],
  ["npm run pub"],
  ["pnpm pub"],
  ["npm --loglevel silly run publish"],
  // pr/66's and pr/68's twins: a boolean option before `run`, after a setting too, and npm's short boolean.
  ["npm --json run publish"],
  ["npm --loglevel silly --json run pub"],
  ["npm -s run publish"],
  ["corepack enable"],
  ["corepack pnpm install"],
  ["git update-ref refs/heads/feat/x HEAD"],
  ["gh api graphql -f query='query { repository(owner:\"o\",name:\"r\") { mergeQueue { entries { totalCount } } } }'"],
  ["bun run publish"],
  ["bun test"],
  ["npx vitest run"],
  ["npx --no stamity run end --run x"],
  ["npm exec -- tsc --noEmit"],
  ["timeout 10 npm test"],
  ["sudo -u root git status"],
  ["echo $'git push -f'"],
  // build/49's and build/51's twins: the dashed form and a runner's command line that run no person-only act.
  ["/usr/lib/git-core/git-status"],
  ["git-lfs ls-files"],
  ["bun exec 'git status'"],
  ["yarn exec 'npm test'"],
  // build/89's twins: PowerShell's command strings that run no person-only act, and a host given a script file.
  ["pwsh -c 'git push origin feat/x'"],
  ["pwsh -c 'git push'"],
  ["pwsh -NoProfile -Command \"gh pr view 3\""],
  ["powershell -ExecutionPolicy Bypass -NoProfile 'git push origin feat/x'"],
  ["powershell -ExecutionPolicy Bypass -File deploy.ps1"],
  ["iex 'npm test'"],
  ["Invoke-Expression -Command 'git status'"],
  // review/183's twins: the interpreter's rest runs no person-only act.
  ["cmd /c git status"],
  ["CMD.EXE /S /K \"git status\""],
  // review/184's twins: a rebase's exec line and a bisect's command that run no person-only act.
  ["git rebase --exec 'git status' main"],
  ["git rebase -x 'git status' main"],
  ["git bisect run git status"],
  // review/185's twins: a script block that runs no person-only act, and a brace a word opened, which is no block.
  ["Invoke-Command -ScriptBlock {git status}"],
  ["git show HEAD@{1}"],
  // review/194's twins: a Windows-path git that runs no person-only act, and a POSIX line whose backslashes git's
  // name loses (`C:Gitbingit.exe` is what a POSIX shell runs).
  ["pwsh -c 'C:\\Git\\bin\\git.exe status'"],
  ["cmd /c 'C:\\Git\\bin\\git.exe status'"],
  ["C:\\Git\\bin\\git.exe push --force origin feat/x"],
  ["gh repo view o/r"],
  // TEST CHANGE (v0a, REQ-FLOW-102): every `gh repo edit` settings flag is now an ask-class repository write, so the
  // two `--description`/`--homepage` rows that stood here moved to the deny matrix as `protection`.
  ["gh repo clone o/r"],
  ["gh api repos/o/r"],
  ["gh api repos/o/r/branches/main"],
  ["gh api -X PATCH repos/o/r/issues/3 -f state=closed"],
  ["gh api repos/o/r/transfer"],
  ["gh api -X POST repos/o/r/issues/3/transfer -f new_repository_id=1"],
  ["gh api repos/o/r/contents/a.md"],
  ["gh api -X PUT repos/o/r/contents/a.md -f message=m -f content=eA== -f branch=feat/x"],
  ["curl -X PUT -d '{\"branch\":\"feat/x\",\"message\":\"m\"}' https://api.github.com/repos/o/r/contents/a.md"],
  ["gh api repos/o/r/merges -f base=feat/x -f head=main"],
  ["gh api repos/o/r/merge-upstream -f branch=feat/x"],
  ["gh api graphql -f query='mutation { createCommitOnBranch(input: {branch: {branchName: \"feat/x\"}}) { commit { oid } } }'"],
  // review/99's twins: a value naming the default branch inside another field, beside the real feature branch.
  ["gh api -X PUT repos/o/r/contents/a.md -f 'message=fix branch: main' -f content=eA== -f branch=feat/x"],
  ["curl -X PUT -d '{\"message\":\"branch: main\",\"branch\":\"feat/x\"}' https://api.github.com/repos/o/r/contents/a.md"],
  [
    "gh api graphql -f query='mutation { createCommitOnBranch(input: {branch: {branchName: \"feat/x\"}, message: {headline: \"branchName: main\"}}) { commit { oid } } }'",
  ],
  [
    "curl -X POST -d '{\"query\":\"mutation { createCommitOnBranch(input: {branch: {branchName: \\\"feat/x\\\"}}) { commit { oid } } }\"}' https://api.github.com/graphql",
  ],
  // review/108's twins: a batch ref update naming only feature branches, unforced.
  [
    "gh api graphql -f query='mutation { updateRefs(input: {repositoryId: \"R\", refUpdates: [{name: \"refs/heads/feat/x\", afterOid: \"abc\", force: false}]}) { clientMutationId } }'",
  ],
  // TEST CHANGE (v0a, REQ-FLOW-124): review/128's twin with a variable `afterOid` stood here; an `afterOid` the line
  // cannot show now reads as a deletion, so it moved to the class rows as push-delete.
  // build/75's twins: a branch created off the default branch, and a read naming a ref.
  ["gh api graphql -f query='mutation { createRef(input: {repositoryId: \"R\", name: \"refs/heads/feat/x\", oid: \"abc\"}) { ref { id } } }'"],
  ["gh api graphql -f query='query { repository(owner: \"o\", name: \"r\") { ref(qualifiedName: \"refs/heads/feat/x\") { id } } }'"],
  // review/127's twins: a raw `-f` field keeps its text, and a placeholder filled from a feature checkout.
  ["gh api -X PUT repos/o/r/contents/a.md -f message=m -f content=eA== -f branch=null"],
  ["gh api -X PUT repos/o/r/contents/a.md -f message=m -f content=eA== -F branch={branch}"],
  ["gh api -X PATCH repos/{owner}/{repo}/git/refs/heads/{branch} -f sha=abc"],
  ["gh api -X PATCH repos/:owner/:repo/git/refs/heads/:branch -f sha=abc"],
  ["gh api -X PATCH repos/o/r/git/refs/heads/feat/x -f sha=abc -F force=false"],
  // build/76's twin: a feature branch's ref with its slash encoded.
  ["gh api -X PATCH repos/o/r/git/refs/heads/feat%2Fx -f sha=abc"],
  ["gh api -X PATCH repos/o/r/git/refs/heads/feat/x -f sha=abc"],
  // review/107's twin: a feature branch's ref with a query.
  ["gh api -X PATCH 'repos/o/r/git/refs/heads/feat/x?x=1' -f sha=abc"],
  ["gh api repos/o/r/pulls/3"],
  ["gh api repos/o/r/branches/main/protection"],
  ["gh api repos/o/r/rulesets"],
  ["gh api repos/o/r/actions/secrets"],
  ["gh api repos/o/r/pulls/3/comments -F in_reply_to=1 -F body=@reply.md"],
  ["curl https://api.github.com/repos/o/r/pulls/3/merge"],
  ["echo 'git push --force origin feat/x'"],
  ["git commit -m 'git push -f'"],
  ["grep -r \"gh pr merge\" docs"],
  ["git log --oneline -1"],
  ["git status"],
  // review/207's twins: a close that keeps the branch, the flag switched off, and `-c` taking the rest as its comment.
  ["gh pr close 3"],
  ["gh pr close 3 --delete-branch=false"],
  ["gh pr close 3 -c 'done'"],
  ["gh pr close 3 -cd"],
  // review/210's twins: a comment or a change request, `-b` taking the rest as its body, the flag switched off, a REST
  // review with another event or none (the API's pending review), a read, and GraphQL reviews that do not approve.
  ["gh pr review 3 --comment -b lgtm"],
  ["gh pr review 3 -r -b 'needs work'"],
  ["gh pr review 3 -ba"],
  ["gh pr review 3 --approve=false"],
  ["gh api repos/o/r/pulls/3/reviews -f event=COMMENT -f body=x"],
  ["gh api repos/o/r/pulls/3/reviews -f body=x"],
  ["gh api repos/o/r/pulls/3/reviews"],
  ["gh api -X GET repos/o/r/pulls/3/reviews -f event=APPROVE"],
  ["gh api repos/o/r/pulls/3/reviews/9/events -f event=REQUEST_CHANGES -f body=x"],
  ["curl -X POST -d '{\"event\":\"COMMENT\",\"body\":\"x\"}' https://api.github.com/repos/o/r/pulls/3/reviews"],
  // review/228's twins: the same body files on a read and on a pull request's comments, a raw field whose `@` is text,
  // and a body the line shows whole beside `-XPOST` and a valued flag whose letters hold no upload.
  ["gh api -X GET repos/o/r/pulls/3/reviews --input r.json"],
  ["gh api -X POST repos/o/r/pulls/3/comments --input r.json"],
  ["gh api repos/o/r/pulls/3/reviews -f body=@r.md"],
  ["curl -X POST -d @r.json https://api.github.com/repos/o/r/pulls/3/comments"],
  ["curl -XPOST -d '{\"event\":\"COMMENT\"}' https://api.github.com/repos/o/r/pulls/3/reviews"],
  ["curl -o out.json --data-binary '{\"event\":\"COMMENT\"}' https://api.github.com/repos/o/r/pulls/3/reviews"],
  ["gh api graphql -f query='mutation { addPullRequestReview(input: {pullRequestId: \"PR_1\", event: COMMENT}) { clientMutationId } }'"],
  ["gh api graphql -f query='mutation { addPullRequestReview(input: {pullRequestId: \"PR_1\", body: \"x\"}) { clientMutationId } }'"],
  ["gh api graphql -f query='mutation { submitPullRequestReview(input: {pullRequestReviewId: \"R_1\", event: REQUEST_CHANGES}) { clientMutationId } }'"],
  // The run verb's push argv (u4's gitWrite hardening + u18b's push), joined as u18b checks it.
  [
    "git -c safe.bareRepository=explicit -c core.fsmonitor=false -c push.followTags=false push origin HEAD:refs/heads/stamity/2026-10-16_x",
    { defaultBranches: ["main"], currentBranch: "stamity/2026-10-16_x", tags: ["v1.0.0"] },
  ],
  // PR #112's resolution round 1's twins (pr/1, pr/3, pr/9, pr/10, pr/11, pr/16).
  ["curl -X POST -d '{\"ref\":\"refs/heads/feat/y\",\"sha\":\"abc\"}' https://api.github.com/repos/o/r/git/refs"],
  ["npm --workspace mypkg run build"],
  ["yarn workspace mypkg run publish"],
  ["npm -w x exec -- git push origin feat/x"],
  ["npm --loglevel silly exec -- git push origin feat/x"],
  ["git push --dry-r origin feat/x"],
  ["git push --no-force-w origin feat/x"],
  ["git push --push-o ci.skip origin feat/x"],
  ["cmd /c g^it status"],
  ["cmd /c g^it push origin feat/x"],
  ["wget https://api.github.com/repos/o/r/releases"],
  ["wget --meth=GET https://api.github.com/repos/o/r/releases/1"],
  ["wget --me=GET https://api.github.com/repos/o/r/releases/1"],
  ["wget --post-d '{\"event\":\"COMMENT\"}' https://api.github.com/repos/o/r/pulls/3/reviews"],
  ["git send-pack git@github.com:o/r.git feat/x"],
  // pr/23's twins: a wgetrc command that sets no method or body, a read method, and a comment-event review body.
  ["wget -e robots=off https://api.github.com/repos/o/r/releases"],
  ["wget -e method=GET https://api.github.com/repos/o/r/releases/1"],
  ["wget -e 'body_data={\"event\":\"COMMENT\"}' https://api.github.com/repos/o/r/pulls/3/reviews"],
  // PR #112's resolution round 4's twins. `git symbolic-ref`'s reads, a write of `HEAD`, a ref pointed at another
  // branch, a branch's symbolic ref deleted, a tag's read, and `-m`'s value (pr/70).
  ["git symbolic-ref HEAD"],
  ["git symbolic-ref --short -q HEAD"],
  ["git symbolic-ref HEAD refs/heads/main"],
  ["git symbolic-ref refs/heads/a refs/heads/feat/x"],
  ["git symbolic-ref -d refs/heads/a"],
  ["git symbolic-ref refs/tags/v9"],
  ["git symbolic-ref -m refs/tags/v9 HEAD refs/heads/feat/x"],
  // Two reads in one curl call, and a body `--next` resets before the review path's own request (pr/72).
  ["curl https://a.example --next https://b.example"],
  ["curl -d '{\"event\":\"APPROVE\"}' https://example.com --next https://api.github.com/repos/o/r/pulls/3/reviews"],
  // A GraphQL read of the repository (pr/74).
  ["gh api graphql -f query='query { repository(owner:\"o\",name:\"r\") { isArchived } }'"],
  // Custom properties read (pr/80).
  ["gh api repos/o/r/properties/values"],
  ["gh api orgs/o/properties/schema"],
  ["curl https://api.github.com/repos/o/r/properties/values"],
  // A curl write whose glob is switched off, judged as the literal path it sends; a glob or an IPv6 host on a read; a
  // plain read; wget's input file on a read (pr/76, pr/77).
  ["curl -X PATCH -d '{\"sha\":\"abc\"}' --globoff 'https://api.github.com/repos/o/r/git/refs/heads/{feature,main}'"],
  ["curl -sg -X PATCH -d '{\"sha\":\"abc\"}' 'https://api.github.com/repos/o/r/git/refs/heads/{feature,main}'"],
  ["curl 'https://example.com/p[1-3].html'"],
  ["curl 'http://[::1]:3000/health'"],
  ["curl https://api.github.com/repos/o/r"],
  ["wget -i urls.txt"],
  ["wget -qi urls.txt"],
  // pr/81's twins: the same targets read, an attached header, and an attached body the line shows whole.
  ["curl -o out.json https://api.github.com/repos/o/r/pulls/3/reviews"],
  ["curl -s https://api.github.com/repos/o/r/git/refs/heads/main"],
  ["curl -H'Accept: application/vnd.github+json' https://api.github.com/repos/o/r/pulls/3/merge"],
  ["curl -d'{\"event\":\"COMMENT\"}' https://api.github.com/repos/o/r/pulls/3/reviews"],
  // pr/82's twins: a symbolic ref pointed at another branch, `HEAD` repointed, a check, a branch's deleted, a plain update.
  ["printf 'symref-create refs/heads/a refs/heads/feat/x\\n' | git update-ref --stdin"],
  ["printf 'symref-update HEAD refs/heads/main\\n' | git update-ref --stdin"],
  ["printf 'symref-verify refs/heads/a refs/heads/main\\n' | git update-ref --stdin"],
  ["printf 'symref-delete refs/heads/a\\n' | git update-ref --stdin"],
  ["printf 'update refs/heads/feat/x HEAD\\n' | git update-ref --stdin"],
  // Their twins in a two-command text (round 4d): a second command pointing a name at another branch or repointing `HEAD`,
  // in either text format, and words a Unicode escape ends.
  ["printf 'verify refs/heads/x HEAD\\nsymref-create refs/heads/a refs/heads/feat/x\\n' | git update-ref --stdin"],
  ["printf 'update refs/heads/x\\0HEAD\\0\\0symref-create refs/heads/a\\0refs/heads/feat/x\\0' | git update-ref -z --stdin"],
  ["printf 'verify refs/heads/x HEAD\\nsymref-update HEAD refs/heads/main\\n' | git update-ref --stdin"],
  ["printf 'symref-create\\u0020refs/heads/a\\u0020refs/heads/feat/x\\n' | git update-ref --stdin"],
  // pr/83's twins: a method the line shows.
  ["curl -X GET https://api.github.com/repos/o/r"],
  ["curl -X POST https://example.com/hook"],
  // Round 4d's: curl's output file named `X` on a read, a cluster's method a read, gh's `-i` alone, before a read's
  // method and before a header, `-X=` naming a read, and a comment's field after `-i`.
  ["curl -oX https://api.github.com/repos/o/r/git/refs/heads/main"],
  ["curl -sXGET https://api.github.com/repos/o/r/git/refs/heads/main"],
  ["gh api -i repos/o/r/git/refs/heads/main"],
  ["gh api -iX GET repos/o/r/git/refs/heads/main"],
  ["gh api -X=GET repos/o/r/pulls/3/merge"],
  ["gh api -iH 'Accept: application/vnd.github+json' repos/o/r/pulls/3/merge"],
  ["gh api repos/o/r/pulls/3/reviews -iFevent=COMMENT"],
  // pr/84's twins: prefixes of curl options that take no value (`--sil`, `--loc`, `--compr`), `--form-escape`'s beside
  // `--form`, the method's prefix on a read, `--next` and `--url` on reads, and `--globoff`'s prefix on a write.
  ["curl --sil https://api.github.com/repos/o/r/git/refs/heads/main"],
  ["curl --loc https://api.github.com/repos/o/r/pulls/3/merge"],
  ["curl --compr https://api.github.com/repos/o/r/pulls/3/reviews"],
  ["curl --form-esc https://api.github.com/repos/o/r/pulls/3/reviews"],
  ["curl --req GET https://api.github.com/repos/o/r/git/refs/heads/main"],
  ["curl https://a.example --nex https://b.example"],
  ["curl --ur https://api.github.com/repos/o/r/releases/1"],
  ["curl --glo -X PATCH -d '{\"sha\":\"abc\"}' 'https://api.github.com/repos/o/r/git/refs/heads/{feature,main}'"],
  // pr/93's twins: a read through a dot segment, and a write whose resolved path no rule names.
  ["curl https://api.github.com/repos/o/r/tmp/../git/refs/heads/main"],
  ["gh api repos/x/y/../../o/r"],
  ["gh api -X PATCH repos/o/r/git/../issues/3 -f title=x"],
  ["curl -X POST -d '{\"body\":\"x\"}' https://api.github.com/repos/o/r/pulls/../issues/3/comments"],
  // pr/94's twins: a sync of the local checkout (no repository named), forced or naming a branch or a source, and a
  // named repository's other branch without `--force`.
  ["gh repo sync"],
  ["gh repo sync --force"],
  ["gh repo sync --branch main"],
  ["gh repo sync -b feat/x --force"],
  ["gh repo sync --source up/r"],
  ["gh repo sync -s up/r -b main"],
  ["gh repo sync o/r --branch feat/x"],
  ["gh repo sync --branch feat/x o/r"],
  ["gh repo sync o/r --branch feat/x --force=false"],
  // pr/96's twins: the repository read.
  ["gh repo view o/r --json isArchived"],
];

/**
 * The ask-class rules (REQ-FLOW-102), written here apart from the source's own set so a rule moved between the classes
 * fails this file: every other rule is refuse-class (REQ-FLOW-124).
 */
// TEST CHANGE, justified (REQ-FLOW-140, REQ-FLOW-138, a4): the admin merge, the deploying push, the deploying dispatch
// and the loosening of the autonomy setting join the ask class; the status write is refuse-class, so it stays out.
// TEST CHANGE, justified (REQ-FLOW-121, review/103): the land verb's approved line joins the ask class.
// TEST CHANGE, justified (REQ-FLOW-134, a4c): a write that reaches an outside party joins the ask class.
// TEST CHANGE, justified (REQ-FLOW-134, review/129): a remote or URL rewrite written joins it, run on the main thread.
const ASK_CLASS = new Set(["push-default", "push-tags", "tag", "pr-merge", "pr-ready", "release", "publish", "secrets", "protection",
  "admin-merge", "push-deploying", "workflow-dispatch", "autonomy-loosen", "land-approved", "outside-write", "remote-write"]);

const ZERO = "0".repeat(40);
/** A GraphQL `updateRefs` call with one entry: its ref name and its `afterOid`. */
const updateRefs = (name: string, oid: string): string =>
  `gh api graphql -f query='mutation { updateRefs(input: {repositoryId: "R", refUpdates: [{name: "${name}", afterOid: "${oid}"}]}) { clientMutationId } }'`;

/**
 * v0a's conformance rows (REQ-FLOW-102, REQ-FLOW-124): a form, the rule the verdict names and its class. A line
 * holding several acts asks only when every act is ask-class, and names its refuse-class act when it holds one.
 */
const CLASSES: readonly (readonly [command: string, rule: string, ask: boolean, ctx?: Ctx])[] = [
  ["gh pr merge 1 --delete-branch", "push-delete", false],
  ["gh pr merge 1 -d", "push-delete", false],
  ["gh pr merge 3 --squash", "pr-merge", true],
  ["git push origin --mirror", "force-push", false],
  ["git push --force origin v1 --tags", "force-push", false],
  ["git push origin :refs/tags/v1", "tag-delete", false],
  ["gh api -X DELETE repos/o/r/git/refs/tags/v1", "tag-delete", false],
  ["gh api -X PATCH repos/o/r/git/refs/tags/v1 -F force=true -f sha=abc", "force-push", false],
  [updateRefs("refs/tags/v1", ZERO), "tag-delete", false],
  [updateRefs("refs/heads/main", ZERO), "push-delete", false],
  [updateRefs("refs/heads/feat", ZERO), "push-delete", false],
  [updateRefs("refs/heads/main", "abc"), "push-default", true],
  [
    "gh api graphql -f query='mutation($o: GitObjectID!) { updateRefs(input: {repositoryId: \"R\", refUpdates: [{name: \"refs/heads/feat/x\", afterOid: $o}, {name: \"refs/heads/feat/y\", afterOid: \"b\"}]}) { clientMutationId } }'",
    "push-delete",
    false,
  ],
  ["gh release delete v1", "release-delete", false],
  ["gh release upload v1 a --clobber", "release-delete", false],
  ["gh release upload v1 a", "release", true],
  ["gh secret delete X", "secrets-delete", false],
  ["gh repo delete o/r", "repo-delete", false],
  ["gh repo edit --visibility public", "repo-irreversible", false],
  ["gh repo edit --visibility private", "repo-irreversible", false],
  ["gh repo edit --default-branch x --visibility public", "repo-irreversible", false],
  ["gh repo edit --enable-auto-merge", "protection", true],
  ["gh repo transfer o/r x", "repo-irreversible", false],
  ["gh api -X PATCH repos/o/r -f private=false", "repo-irreversible", false],
  ["gh api -X PATCH repos/o/r --input body.json", "repo-irreversible", false],
  ["npm unpublish x@1.0.0", "unpublish", false],
  ["npm dist-tag rm x beta", "unpublish", false],
  ["npm dist-tag add x@1.0.0 latest", "publish", true],
  ["gh api graphql -f query='mutation { deleteRepositoryRuleset(input: {repositoryRulesetId: \"R\"}) { clientMutationId } }'", "protection-delete", false],
  ["gh api -X DELETE repos/o/r/branches/main/protection", "protection-delete", false],
  ["git tag v1", "tag", true],
  ["git tag -d v1", "tag-delete", false],
  // A ref or a review body the line cannot show keeps its concrete ask-class rule.
  ["gh api graphql -f query='mutation { updateRef(input: {refId: \"x\", oid: \"abc\"}) { clientMutationId } }'", "push-default", true],
  ["gh api graphql -f query='mutation($n: String!) { createRef(input: {repositoryId: \"R\", name: $n, oid: \"abc\"}) { ref { id } } }' -f n=refs/tags/v1", "push-tags", true],
  ["gh api repos/o/r/pulls/3/reviews --input r.json", "pr-merge", true],
  // Mixed lines: a refused act wins over an ask-class one, in a segment, a GraphQL text, a `--next` call or a path.
  ["gh pr merge 1 && git push origin :feat", "push-delete", false],
  ["gh pr merge 1 && git tag v1", "pr-merge", true],
  [
    "gh api graphql -f query='mutation { mergePullRequest(input: {pullRequestId: \"P\"}) { clientMutationId } deleteRef(input: {refId: \"x\"}) { clientMutationId } }'",
    "push-delete",
    false,
  ],
  ["curl -X DELETE https://api.github.com/repos/o/r/git/refs/heads/feat --next -X PUT https://api.github.com/repos/o/r/pulls/1/merge", "push-delete", false],
  ["curl -X DELETE https://api.github.com/repos/o/r/pulls/1/merge https://api.github.com/repos/o/r/git/refs/heads/feat", "push-delete", false],
  // PR #112's round 5 forms in their classes (the replay onto e377be7a): a sync onto a named repository's default branch
  // asks and its hard reset refuses, an unarchive asks, and a path read ask-class as written and refuse-class with its
  // dot segments resolved refuses, both readings collected.
  ["gh repo sync o/r", "push-default", true],
  ["gh repo sync o/r --force", "force-push", false],
  ["gh repo unarchive o/r --yes", "protection", true],
  ["gh repo unarchive o/r --yes && gh repo sync o/r --force", "force-push", false],
  ["gh api -X DELETE repos/o/r/pulls/1/merge/../../../git/refs/heads/feat", "push-delete", false],
  // review/33: one path that a `merge-async` segment once read as an ask-class merge keeps its refuse-class reading.
  ["gh api -X DELETE repos/o/r/git/refs/heads/x/merge-async", "push-delete", false],
  ["gh api -X DELETE repos/o/r/git/refs/tags/merge-async", "tag-delete", false],
  ["gh api -X PATCH repos/o/r/git/refs/heads/merge-async -F force=true -f sha=abc", "force-push", false],
  ["gh api -X DELETE repos/o/r/branches/merge-async/protection", "protection-delete", false],
  ["gh api -X DELETE repos/o/r/properties/schema/merge-async", "protection-delete", false],
  ["gh api -X DELETE repos/o/merge-async", "repo-delete", false],
  ["gh api -X PATCH repos/o/merge-async -f visibility=public", "repo-irreversible", false],
  ["gh api -X POST repos/o/r/pulls/3/merge-async", "pr-merge", true],
  // review/36: a `git/refs` update whose body the line cannot show may set `force`, so it reads as forced.
  ["gh api -X PATCH repos/o/r/git/refs/heads/main --input b.json", "force-push", false],
  ["gh api -X PATCH repos/o/r/git/refs/heads/feat --input b.json", "force-push", false],
  ["curl -X PATCH -d @b.json https://api.github.com/repos/o/r/git/refs/tags/v1", "force-push", false],
  ["gh api -X PATCH repos/o/r/git/refs/heads/main -f sha=abc", "push-default", true],
  // review/34, review/37: pnpm hands `unpublish` and `dist-tag` to npm; yarn's `npm tag` removes and adds a dist-tag.
  ["pnpm unpublish x@1.0.0", "unpublish", false],
  ["pnpm dist-tag rm x beta", "unpublish", false],
  ["pnpm --filter x dist-tag add x@1.0.0 latest", "publish", true],
  ["yarn npm tag remove x beta", "unpublish", false],
  ["yarn npm tag add x@1.0.0 latest", "publish", true],
  // review/38: a deployment environment's deletion takes its secrets, variables and protection rules with it.
  ["gh api -X DELETE repos/o/r/environments/prod", "protection-delete", false],
  ["curl -X DELETE https://api.github.com/repos/o/r/environments/prod", "protection-delete", false],
  ["gh api -X PUT repos/o/r/environments/prod --input env.json", "protection", true],
  // review/35: a local tag deleted through `git update-ref` by a `-d` cluster or a `--stdin` `update` to an empty value.
  ["git update-ref -dm drop refs/tags/v1", "tag-delete", false],
  ["printf 'update refs/tags/v1 \\n' | git update-ref --stdin", "tag-delete", false],
  ["printf 'update refs/tags/v1  abc\\n' | git update-ref --stdin", "tag-delete", false],
  ["printf 'update refs/tags/v1\\0\\0\\0' | git update-ref -z --stdin", "tag-delete", false],
  ["printf 'update refs/tags/v1 HEAD\\n' | git update-ref --stdin", "tag", true],
  ["printf 'update refs/tags/v1\\0HEAD\\0\\0' | git update-ref -z --stdin", "tag", true],
  ["git update-ref -m drop refs/tags/v1 HEAD", "tag", true],
  // review/35, round 2: an emptied `update` after an escaped line break; one with a value there still asks.
  ["printf 'start\\nupdate refs/tags/v1 \\n' | git update-ref --stdin", "tag-delete", false],
  ["printf 'start\\x0aupdate refs/tags/v1 \\n' | git update-ref --stdin", "tag-delete", false],
  ["printf 'start\\012update refs/tags/v1 \\n' | git update-ref --stdin", "tag-delete", false],
  ["printf 'start\\0update refs/tags/v1\\0\\0\\0' | git update-ref -z --stdin", "tag-delete", false],
  ["printf 'start\\nupdate refs/tags/v1 HEAD\\n' | git update-ref --stdin", "tag", true],
  ["printf 'start\\nsymref-update refs/tags/v9\\n' | git update-ref --stdin", "tag", true],
  // review/51: an environment's deployment protection rule or branch policy, removed or written, in each REST spelling.
  ["gh api -X DELETE repos/o/r/environments/prod/deployment_protection_rules/7", "protection-delete", false],
  ["gh api --method DELETE repos/o/r/environments/prod/deployment-branch-policies/7", "protection-delete", false],
  ["curl -X DELETE https://api.github.com/repos/o/r/environments/prod/deployment_protection_rules/7", "protection-delete", false],
  ["curl --request DELETE https://api.github.com/repos/o/r/environments/prod/deployment-branch-policies/7", "protection-delete", false],
  ["gh api repos/o/r/environments/prod/deployment_protection_rules -F integration_id=5", "protection", true],
  ["gh api --method POST repos/o/r/environments/prod/deployment-branch-policies --input p.json", "protection", true],
  ["gh api -X PUT repos/o/r/environments/prod/deployment-branch-policies/7 -f name=release", "protection", true],
  ["curl -X POST -d '{\"name\":\"release\"}' https://api.github.com/repos/o/r/environments/prod/deployment-branch-policies", "protection", true],
  ["curl -X PATCH https://api.github.com/repos/o/r/environments/prod/deployment_protection_rules/7", "protection", true],
  // review/51, round 4: an environment name holding a slash, sent as `%2F` or plain, in each of the three environment
  // rules; a variable below an environment stays a variable, not the environment.
  ["gh api -X DELETE repos/o/r/environments/release%2Feu", "protection-delete", false],
  ["curl -X DELETE https://api.github.com/repos/o/r/environments/release/eu", "protection-delete", false],
  ["gh api -X PUT repos/o/r/environments/release%2Feu --input env.json", "protection", true],
  ["gh api -X DELETE repos/o/r/environments/release%2Feu/deployment_protection_rules/7", "protection-delete", false],
  ["curl -X DELETE https://api.github.com/repos/o/r/environments/release/eu/deployment-branch-policies/7", "protection-delete", false],
  ["gh api --method POST repos/o/r/environments/release%2Feu/deployment-branch-policies -f name=main", "protection", true],
  ["gh api -X DELETE repos/o/r/environments/release%2Feu/secrets/TOKEN", "secrets-delete", false],
  ["curl -X DELETE https://api.github.com/repos/o/r/environments/release/eu/variables/FOO", "secrets-delete", false],
  ["gh api -X PUT repos/o/r/environments/release%2Feu/secrets/TOKEN -f encrypted_value=x -f key_id=1", "secrets", true],
  ["gh api -X DELETE repos/o/r/environments/prod/variables/FOO", "secrets-delete", false],
  // review/76: the user's own Codespaces secrets, the REST twin of `gh secret delete --user` and `gh secret set --user`.
  ["gh api -X DELETE user/codespaces/secrets/TOKEN", "secrets-delete", false],
  ["curl -X DELETE -H 'Authorization: Bearer x' https://api.github.com/user/codespaces/secrets/TOKEN", "secrets-delete", false],
  ["gh api -X PUT /user/codespaces/secrets/TOKEN -f encrypted_value=x -f key_id=1", "secrets", true],
  // review/52: yarn classic's own `tag` command removes and adds a dist-tag, at the start or after `workspace <name>`.
  ["yarn tag remove x beta", "unpublish", false],
  ["yarn tag rm x beta", "unpublish", false],
  ["yarn workspace x tag remove x beta", "unpublish", false],
  ["yarn tag add x@1.0.0 latest", "publish", true],
  // a4 (REQ-FLOW-140, REQ-FLOW-138, build/8, build/46): the new rules in their classes, each beside an existing row's
  // form. A commit status or check run written is refuse-class in every spelling; the admin merge, the deploying push,
  // a dispatch with no autonomy context and a loosening ask; a flagless `gh repo edit`, which asks its questions on the
  // terminal (visibility among them), is refuse-class; a refspec in a PowerShell group reads as a default-branch push.
  ["gh api -X POST repos/o/r/statuses/abc123 -f state=success -f context=ci", "status-write", false],
  ["gh api repos/o/r/statuses/abc123 -f state=success", "status-write", false],
  ["curl -X POST -d '{\"state\":\"success\"}' https://api.github.com/repos/o/r/statuses/abc123", "status-write", false],
  ["gh api -X POST repos/o/r/check-runs -f name=ci -f head_sha=abc -f conclusion=success", "status-write", false],
  ["gh api -X PATCH repos/o/r/check-runs/7 -f conclusion=success", "status-write", false],
  ["gh api graphql -f query='mutation { createCheckRun(input: {repositoryId: \"R\", headSha: \"abc\", name: \"ci\"}) { checkRun { id } } }'", "status-write", false],
  ["gh api graphql -f query='mutation { updateCheckRun(input: {repositoryId: \"R\", checkRunId: \"C\", conclusion: SUCCESS}) { checkRun { id } } }'", "status-write", false],
  ["gh pr merge 3 --squash && gh api -X POST repos/o/r/statuses/abc -f state=success", "status-write", false],
  ["gh pr merge 3 --admin --squash", "admin-merge", true],
  ["gh pr merge --admin 3", "admin-merge", true],
  ["git push origin production", "push-deploying", true, { defaultBranches: [], currentBranch: "feat/x", tags: [], deployingBranches: ["production"] }],
  ["gh workflow run deploy.yml -f env=prod", "workflow-dispatch", true],
  ["gh api -X POST repos/o/r/actions/workflows/deploy.yml/dispatches -f ref=main", "workflow-dispatch", true],
  ["gh api -X POST repos/o/r/dispatches -f event_type=deploy", "workflow-dispatch", true],
  ["stamity sync --loosen", "autonomy-loosen", true],
  // TEST CHANGE, justified (REQ-FLOW-121, review/103): the land verb's approved line, ask-class.
  ["stamity run land --run x --approved", "land-approved", true],
  // review/117: a line past 65,536 characters is refused in every mode before any reading.
  [`echo ${"a".repeat(70_000)}`, "line-too-long", false],
  ["gh repo edit", "repo-irreversible", false],
  ["gh repo edit o/r", "repo-irreversible", false],
  ["git push origin (git branch --show-current)", "push-default", true],
  ["git push origin \"$(git branch --show-current)\"", "push-default", true],
  ["git push origin `git branch --show-current`", "push-default", true],
];

describe("personOnlyVerdict — ask or refuse (v0a)", () => {
  it("lets the local tags' coded throw out after an ask-class act, so the guard still refuses the line (pr/95)", () => {
    // Every segment is read now, so a tag read past the ceiling after a merge throws where it once went unread.
    const ctx = {
      defaultBranches: [],
      currentBranch: "feat/x",
      get tags(): readonly string[] {
        throw Object.assign(new Error("tag names"), { code: "TAG_NAMES_OVER_10000" });
      },
    };
    expect(() => personOnlyVerdict("gh pr merge 1 && git push origin v9.9.9", ctx)).toThrow("tag names");
  });

  it.each(CLASSES.map(([command, rule, ask, ctx]) => ({ command, rule, ask, ctx })))(
    "reads $command as $rule, ask $ask",
    ({ command, rule, ask, ctx }) => {
      expect(personOnlyVerdict(command, ctx ?? ON_FEATURE)).toMatchObject({ deny: true, rule, ask });
      expect(ASK_CLASS.has(rule)).toBe(ask);
    },
  );

  it("allows a dist-tag listing, the read neighbour of its add and rm", () => {
    expect(personOnlyVerdict("npm dist-tag ls x", ON_FEATURE)).toEqual({ deny: false });
    expect(personOnlyVerdict("pnpm dist-tag ls x", ON_FEATURE)).toEqual({ deny: false });
    expect(personOnlyVerdict("yarn npm tag list x", ON_FEATURE)).toEqual({ deny: false });
  });

  it("allows a deployment environment's read, the neighbour of its deletion (review/38)", () => {
    expect(personOnlyVerdict("gh api repos/o/r/environments/prod", ON_FEATURE)).toEqual({ deny: false });
  });

  it("allows a deployment protection rule's or branch policy's read, and a deployment's own write (review/51)", () => {
    expect(personOnlyVerdict("gh api repos/o/r/environments/prod/deployment_protection_rules", ON_FEATURE)).toEqual({ deny: false });
    expect(personOnlyVerdict("curl https://api.github.com/repos/o/r/environments/prod/deployment-branch-policies/7", ON_FEATURE)).toEqual({ deny: false });
    // A deployment created is not a change to what gates one.
    expect(personOnlyVerdict("gh api -X POST repos/o/r/deployments -f ref=feat", ON_FEATURE)).toEqual({ deny: false });
  });

  it("reads a slash-named environment and each sub-resource below one under its own rule (review/51, round 4)", () => {
    const act = (command: string): string => {
      const verdict = personOnlyVerdict(command, ON_FEATURE);
      return verdict.deny ? verdict.act : "";
    };
    expect(act("gh api -X DELETE repos/o/r/environments/release%2Feu")).toMatch(/^A deployment environment deletion /);
    expect(act("gh api -X DELETE repos/o/r/environments/release%2Feu/deployment_protection_rules/7")).toMatch(
      /^A deployment protection rule or branch policy deletion /,
    );
    expect(act("gh api -X PUT repos/o/r/environments/prod/deployment-branch-policies/7 -f name=release")).toMatch(
      /^A deployment protection rule or branch policy write /,
    );
    expect(act("gh api -X PUT repos/o/r/environments/release%2Feu/secrets/TOKEN -f encrypted_value=x -f key_id=1")).toMatch(
      /^A secret or variable write /,
    );
  });

  it("allows a slash-named environment's read, and a path of the same shape that is no environment's (review/51, round 4)", () => {
    expect(personOnlyVerdict("gh api repos/o/r/environments/release%2Feu", ON_FEATURE)).toEqual({ deny: false });
    expect(personOnlyVerdict("gh api -X POST repos/o/r/deployments -f ref=feat -f environment=release/eu", ON_FEATURE)).toEqual({ deny: false });
    // A repository named `environments`, and a feature branch whose name holds an environment path.
    expect(personOnlyVerdict("gh api -X POST repos/o/environments/issues -f title=x", ON_FEATURE)).toEqual({ deny: false });
    expect(personOnlyVerdict("gh api -X PATCH repos/o/r/git/refs/heads/environments/release/eu/secrets -f sha=abc", ON_FEATURE)).toEqual({
      deny: false,
    });
  });

  it("allows a read of the user's Codespaces secrets, the neighbour of their deletion and write (review/76)", () => {
    expect(personOnlyVerdict("gh api user/codespaces/secrets", ON_FEATURE)).toEqual({ deny: false });
    expect(personOnlyVerdict("gh api user/codespaces/secrets/public-key", ON_FEATURE)).toEqual({ deny: false });
    expect(personOnlyVerdict("curl https://api.github.com/user/codespaces/secrets/TOKEN", ON_FEATURE)).toEqual({ deny: false });
  });

  it("allows yarn classic's tag listing, and a script named `tag` run through `yarn run` (review/52)", () => {
    expect(personOnlyVerdict("yarn tag list x", ON_FEATURE)).toEqual({ deny: false });
    expect(personOnlyVerdict("yarn run tag remove x beta", ON_FEATURE)).toEqual({ deny: false });
  });
});

describe("personOnlyVerdict — the deny matrix", () => {
  // TEST CHANGE (v0a): each row also asserts its class, `ask` read from the rule's class, and the act the verdict names.
  it.each(DENY.map(([command, rule, ctx]) => ({ command, rule, ctx })))("denies $command as $rule", ({ command, rule, ctx }) => {
    const verdict = personOnlyVerdict(command, ctx ?? ON_FEATURE);
    expect(verdict).toMatchObject({ deny: true, rule, ask: ASK_CLASS.has(rule) });
    if (verdict.deny) expect(verdict.reason).toContain(rule);
    if (verdict.deny) expect(verdict.reason.startsWith(`${verdict.act} is a person-only act (${rule})`)).toBe(true);
  });

  it.each(ALLOW.map(([command, ctx]) => ({ command, ctx })))("allows $command", ({ command, ctx }) => {
    expect(personOnlyVerdict(command, ctx ?? ON_FEATURE)).toEqual({ deny: false });
  });

  it("covers every rule id in the table, and names no rule outside it", () => {
    const ids = new Set(PERSON_ONLY_RULES.map((rule) => rule.id));
    // TEST CHANGE (v0a, REQ-FLOW-124): the seven refuse-class rules join the table after today's eleven.
    expect([...ids]).toEqual([
      "force-push",
      "push-default",
      "push-tags",
      "push-delete",
      "tag",
      "pr-merge",
      "pr-ready",
      "release",
      "publish",
      "secrets",
      "protection",
      "tag-delete",
      "release-delete",
      "secrets-delete",
      "repo-delete",
      "repo-irreversible",
      "protection-delete",
      "unpublish",
      // TEST CHANGE, justified (REQ-FLOW-140, REQ-FLOW-138, a4): five rules join the table after 1.16.0's eighteen.
      "status-write",
      "admin-merge",
      "push-deploying",
      "workflow-dispatch",
      "autonomy-loosen",
      // TEST CHANGE, justified (REQ-FLOW-121, review/103): one more rule joins the table.
      "land-approved",
      // TEST CHANGE, justified (review/117): the refuse-class cap on a line too long for the guard to read joins it.
      "line-too-long",
      // TEST CHANGE, justified (REQ-FLOW-134, a4c): the ask-class write that reaches an outside party joins it.
      "outside-write",
      // TEST CHANGE, justified (REQ-FLOW-134, review/129): a remote or URL rewrite written joins it.
      "remote-write",
    ]);
    const hit = new Set([...DENY, ...CLASSES].map(([, rule]) => rule));
    expect(hit).toEqual(ids);
  });

  it("gives each rule in the table the class this file reads it with", () => {
    for (const rule of PERSON_ONLY_RULES) expect(rule.ask, rule.id).toBe(ASK_CLASS.has(rule.id));
  });
});

describe("personOnlyVerdict — the branch context decides an implied destination", () => {
  for (const command of ["git push", "git push origin", "git push origin HEAD"]) {
    it(`${command}: denied on main, allowed on feat/x`, () => {
      expect(personOnlyVerdict(command, ON_MAIN)).toMatchObject({ deny: true, rule: "push-default" });
      expect(personOnlyVerdict(command, ON_FEATURE)).toEqual({ deny: false });
    });
  }

  it("counts main and master as default whatever the context names", () => {
    const ctx = { defaultBranches: ["trunk"], currentBranch: "master", tags: [] };
    expect(personOnlyVerdict("git push", ctx)).toMatchObject({ deny: true, rule: "push-default" });
    expect(personOnlyVerdict("git push origin main", ctx)).toMatchObject({ deny: true, rule: "push-default" });
  });

  it("reads a current branch given as a full ref", () => {
    const ctx = { defaultBranches: [], currentBranch: "refs/heads/main", tags: [] };
    expect(personOnlyVerdict("git push", ctx)).toMatchObject({ deny: true, rule: "push-default" });
  });
});

describe("personOnlyVerdict — the local tags are read only for a push refspec (review/218)", () => {
  /** A context whose tags count each read, as the guard's reads them from disk on access. */
  const counting = (): { ctx: Ctx; reads: () => number } => {
    let reads = 0;
    const ctx = {
      defaultBranches: [],
      currentBranch: "feat/x",
      get tags(): readonly string[] {
        reads += 1;
        return ["v1.0.0"];
      },
    };
    return { ctx, reads: () => reads };
  };

  it.each([["ls -la"], ["git status"], ["git fetch origin"], ["gh pr view 3"], ["git push"], ["git push origin refs/tags/v2"]])(
    "reads no tag for %j",
    (command) => {
      const { ctx, reads } = counting();
      personOnlyVerdict(command, ctx);
      expect(reads()).toBe(0);
    },
  );

  it("reads them once for a refspec that may name one, and denies the tag it names", () => {
    const branchPush = counting();
    expect(personOnlyVerdict("git push origin feat/x feat/y", branchPush.ctx)).toEqual({ deny: false });
    expect(branchPush.reads()).toBe(1);
    const tagPush = counting();
    expect(personOnlyVerdict("git push origin v1.0.0", tagPush.ctx)).toMatchObject({ deny: true, rule: "push-tags" });
    expect(tagPush.reads()).toBe(1);
  });
});

describe("personOnlyVerdict — the respelling residual (named in SECURITY.md by u21)", () => {
  // These are ALLOWED on purpose: a command the guard can only see as text is
  // respelled through an alias or a computed string. Asserted so the gap is a
  // written, tested residual rather than an unnoticed one; the pre-flight's REST
  // check (REQ-FLOW-101) is the wall that holds behind it.
  it.each([
    ["git -c alias.p=push p -f origin feat/x"],
    ["alias gp='git push -f'; gp origin feat/x"],
    // A tag pushed by its bare name reads as a branch name when the context lists no such tag (u14 unable to read
    // `refs/tags/`); with the tag listed it is denied, in the matrix above.
    ["git push origin v1.0.0"],
    // PowerShell's encoded command, and a line another command pipes into `iex` (build/89).
    ["pwsh -EncodedCommand ZwBpAHQAIABwAHUAcwBoACAALQBmAA=="],
    ["echo 'git push -f origin feat/x' | iex"],
    // A `git update-ref --stdin` text read from a file (pr/53), and a gh alias or extension, which gh expands or runs
    // where the line shows only its name (pr/56; refused unattended, below).
    ["git update-ref --stdin < refs.txt"],
    ["gh land 123"],
  ])("allows %j", (command) => {
    expect(personOnlyVerdict(command, ON_MAIN)).toEqual({ deny: false });
  });

  // TEST CHANGE, justified (REQ-FLOW-138, review/54): a shell's command string built by a substitution was allowed here
  // as a respelling the guard cannot read. Its marks now carry into the nested reading, so every command it may hold
  // could spell `--loosen`, and it asks as a loosening; the push it respells is still not read.
  it.each([["sh -c \"$(printf '%s' 'git pu' 'sh -f')\""], ["sh -c \"$(echo Z2l0IHB1c2ggLWY= | base64 -d)\""]])(
    "asks for %j as a loosening it cannot read, the respelled push still unread",
    (command) => {
      expect(personOnlyVerdict(command, ON_MAIN)).toMatchObject({ deny: true, rule: "autonomy-loosen", ask: true });
    },
  );
});

describe("the nested-command depth limit (pr/58)", () => {
  /** `line` inside `layers` literal `sh -c` layers, each quoted for the one around it. */
  const nest = (line: string, layers: number): string => {
    let text = line;
    for (let layer = 0; layer < layers; layer += 1) text = `sh -c '${text.replace(/'/g, "'\\''")}'`;
    return text;
  };
  /** The `code` of what `read` throws, or `null` when it returns. */
  const thrown = (read: () => unknown): unknown => {
    try {
      read();
      return null;
    } catch (error) {
      return (error as { code?: unknown }).code;
    }
  };

  it("reads a line four layers down as its own", () => {
    expect(personOnlyVerdict(nest("git push --force origin feat/x", 4), ON_FEATURE)).toMatchObject({ deny: true, rule: "force-push" });
    expect(unattendedPushVerdict(nest("git push origin feat/x", 4)).deny).toBe(true);
    expect(personOnlyVerdict(nest("git status", 4), ON_FEATURE)).toEqual({ deny: false });
    expect(unattendedPushVerdict(nest("git status", 4))).toEqual({ deny: false });
  });

  it("throws a coded NESTING_DEPTH past depth 4 in both verdicts, whatever the line holds, so the guard refuses it", () => {
    for (const line of ["git push --force origin feat/x", "git status"]) {
      expect(thrown(() => personOnlyVerdict(nest(line, 5), ON_FEATURE)), line).toBe("NESTING_DEPTH");
      expect(thrown(() => unattendedPushVerdict(nest(line, 5))), line).toBe("NESTING_DEPTH");
    }
    // A substitution past the limit is a nesting too.
    expect(thrown(() => personOnlyVerdict(nest("echo \"$(git status)\"", 4), ON_FEATURE))).toBe("NESTING_DEPTH");
  });
});

describe("an HTTP call whose method or target the line cannot show (pr/73, pr/76, pr/77, pr/83)", () => {
  /** The `code` of what `read` throws, or `null` when it returns. */
  const thrown = (read: () => unknown): unknown => {
    try {
      read();
      return null;
    } catch (error) {
      return (error as { code?: unknown }).code;
    }
  };

  it.each([
    // A curl or wget configuration file holds options the line does not show, a method and a URL among them (pr/73),
    // in every spelling: apart, attached, the `=` form, inside a short cluster, stdin, a unique prefix, a later request.
    ["curl -K req.cfg"],
    ["curl --config req.cfg"],
    ["curl --config=req.cfg https://api.github.com/repos/o/r"],
    ["curl -sK req.cfg"],
    ["curl -Kreq.cfg"],
    ["curl -K - https://example.com"],
    ["curl --conf req.cfg"],
    ["curl https://example.com --next -K req.cfg"],
    ["wget --config=req.rc https://example.com"],
    ["wget --config req.rc https://example.com"],
    ["wget --conf=req.rc https://example.com"],
    // A curl write whose target curl expands by its globbing (pr/76): `{…}` and `[…]`, a body alone making the write, a
    // `g` that is a value and no `--globoff`, and `--globoff` given to another request only.
    ["curl -X PATCH -d '{\"sha\":\"abc\"}' 'https://api.github.com/repos/o/r/git/refs/heads/{feature,main}'"],
    ["curl -X PUT 'https://api.github.com/repos/o/r/{pulls/3/merge,x}'"],
    ["curl -d '{\"query\":\"mutation { mergePullRequest(input: {}) { clientMutationId } }\"}' 'https://api.github.com/{graphql,x}'"],
    ["curl -X DELETE 'https://api.github.com/repos/o/r/git/refs/heads/ma[i-j]n'"],
    ["curl -og -X PATCH -d x 'https://api.github.com/repos/o/r/git/refs/heads/{a,main}'"],
    ["curl --globoff https://example.com --next -X PATCH -d x 'https://api.github.com/repos/o/r/git/refs/heads/{a,main}'"],
    // A wget write whose targets come from an input file (pr/77): apart, the `=` form, a cluster, attached, a prefix,
    // the wgetrc command.
    ["wget --method DELETE -i urls.txt"],
    ["wget --post-data=x --input-file=u.txt"],
    ["wget -e method=PUT -qi u.txt"],
    ["wget --method=PATCH -iu.txt"],
    ["wget --meth=DELETE --input-f u.txt"],
    ["wget -e input=u.txt --method DELETE"],
    // A short cluster that holds `-:` among other letters: where curl's next request starts is not shown (pr/72).
    ["curl -X DELETE https://api.github.com/repos/o/r/git/refs/heads/feat -s: -X GET https://example.com"],
    // A method the line cannot show (pr/83): `-X`, `--request`, `--method` or a wgetrc `method=` holding `$` or a
    // backtick. A target held in a variable is not refused: it stays the respelling residual.
    ["M=DELETE; curl -X \"$M\" https://api.github.com/repos/o/r/git/refs/heads/main"],
    ["curl --request \"$(echo PUT)\" https://api.github.com/repos/o/r/pulls/3/merge"],
    ["wget --method=\"$M\" https://api.github.com/repos/o/r/pulls/3"],
    ["wget -e \"method=$M\" https://api.github.com/repos/o/r/pulls/3"],
    // A short cluster's method the line cannot show (round 4d): attached after curl's boolean letters, quoted, braced, a
    // substitution or a backtick, and after gh's `-i`; and a method word the line ends before, an unquoted substitution
    // having cut it.
    ["M=DELETE; curl -sX$M https://api.github.com/repos/o/r/git/refs/heads/main"],
    ["curl -sX\"$M\" https://api.github.com/repos/o/r/git/refs/heads/main"],
    ["curl -sX${M} https://api.github.com/repos/o/r/git/refs/heads/main"],
    ["curl -sX\"$(echo PUT)\" https://api.github.com/repos/o/r/pulls/3/merge"],
    ["curl -sX`echo PUT` https://api.github.com/repos/o/r/pulls/3/merge"],
    ["curl -gsX$M https://api.github.com/repos/o/r/git/refs/heads/main"],
    ["curl -X `echo DELETE` https://api.github.com/repos/o/r/git/refs/heads/main"],
    ["gh api -iX$M repos/o/r/git/refs/heads/main"],
    ["gh api -iX \"$M\" repos/o/r/git/refs/heads/main"],
    // A configuration file named through a prefix curl finds ambiguous (pr/84), read as `--config`.
    ["curl --co req.cfg"],
    ["curl --con req.cfg https://api.github.com/repos/o/r"],
  ])("throws a coded HTTP_TARGET_HIDDEN for %j in both verdicts, so the guard refuses it", (command) => {
    expect(thrown(() => personOnlyVerdict(command, ON_FEATURE))).toBe("HTTP_TARGET_HIDDEN");
    expect(thrown(() => unattendedPushVerdict(command))).toBe("HTTP_TARGET_HIDDEN");
  });
});

describe("a substitution, wget's `-X` and gh's options before its subcommand, read in both verdicts (v0b)", () => {
  // pr/89: an unquoted substitution no longer cuts the command, so the words after it are still its own; pr/90: wget's
  // `-X` is `--exclude-directories`, no method; pr/97: an option before gh's subcommand takes its value as gh's parser
  // does there, so the subcommand's rule applies. Conformance rows (the cell's) sit beside the rows that were allowed.
  it.each([
    ["git push origin `true` HEAD:main", "push-default"],
    ["git push origin $(true) HEAD:main", "push-default"],
    ["curl -X DELETE $(true) https://api.github.com/repos/o/r/git/refs/heads/feat", "push-delete"],
    ["curl -X DELETE `true` https://api.github.com/repos/o/r/git/refs/heads/feat", "push-delete"],
    ["curl -sXDELETE $(true) https://api.github.com/repos/o/r/git/refs/heads/feat", "push-delete"],
    ["curl --req DELETE `true` https://api.github.com/repos/o/r/git/refs/heads/feat", "push-delete"],
    ["wget --method=DELETE -X /tmp https://api.github.com/repos/o/r/git/refs/heads/feat", "push-delete"],
    ["wget --method=DELETE -X/tmp https://api.github.com/repos/o/r/git/refs/heads/feat", "push-delete"],
    ["gh pr --body x merge 1", "pr-merge"],
    ["gh pr -t x merge 1", "pr-merge"],
    ["gh repo --source o/up sync o/r --force", "force-push"],
    ["gh repo -b main sync o/r", "push-default"],
    ["gh --method DELETE api repos/o/r/git/refs/heads/feat", "push-delete"],
    // Conformance: `-R` before the group, a group's own value option, and a symref command after another in a text
    // the line carries, followed by another command.
    ["gh -R o/r pr merge 1", "pr-merge"],
    ["gh --repo o/r repo unarchive o/r", "protection"],
    ["printf 'verify refs/heads/x HEAD\\nsymref-create refs/heads/safe refs/heads/main\\n' | git update-ref --stdin && git status", "push-default"],
  ])("personOnlyVerdict reads %j as %s", (command, rule) => {
    expect(personOnlyVerdict(command, ON_FEATURE)).toMatchObject({ deny: true, rule });
  });

  it.each([
    ["curl -X PATCH `true` https://api.github.com/repos/o/r/pulls/3", "PATCH pulls/3"],
    ["curl -X DELETE $(true) https://api.github.com/repos/o/r/git/refs/heads/feat", "DELETE git/refs/heads/feat"],
    ["wget --method=DELETE -X /tmp https://api.github.com/repos/o/r/git/refs/heads/feat", "DELETE git/refs/heads/feat"],
    ["gh --method DELETE api repos/o/r/git/refs/heads/feat", "DELETE git/refs/heads/feat"],
    ["gh pr --title t create", "`gh pr create`"],
    ["gh repo -b main sync", "`gh repo sync`"],
    ["gh --repo o/r repo sync --force", "`gh repo sync`"],
  ])("unattendedPushVerdict refuses %j as the act it hides", (command, act) => {
    const verdict = unattendedPushVerdict(command);
    expect(verdict.deny).toBe(true);
    if (verdict.deny) expect(verdict.reason).toContain(act);
  });

  it.each([
    ["wget -X /tmp https://api.github.com/repos/o/r/git/refs/heads/feat"],
    ["curl -s $(true) https://api.github.com/repos/o/r/pulls/3"],
    ["gh pr --body x view 1"],
    ["gh -R o/r pr view 1"],
    // TEST CHANGE, justified (REQ-FLOW-140, build/46, a4): `git push origin $(true) feat/x` left this list: a refspec
    // word holding a substitution is one the line cannot show, so it now reads as a push to the default branch (below).
    ["git push origin feat/x"],
  ])("personOnlyVerdict allows the read or feature-branch twin %j", (command) => {
    expect(personOnlyVerdict(command, ON_FEATURE)).toEqual({ deny: false });
  });
});

describe("unattendedPushVerdict — a run verb stands alone on its line (v0b, REQ-FLOW-121)", () => {
  const VERB = "npx --no stamity run end --run x";
  /** PowerShell's closing typographic quote, built from its code so the file holds no raw one. */
  const RSQ = String.fromCharCode(0x2019);
  /** The refusal for a line that is more than the verb: the run verbs named, and what broke the shape. */
  const expectRefused = (verdict: ReturnType<typeof unattendedPushVerdict>, broke: string): void => {
    expect(verdict.deny).toBe(true);
    if (!verdict.deny) return;
    expect(verdict.reason).toContain("on a line that is more than the verb");
    expect(verdict.reason).toContain(broke);
    expect(verdict.reason).toContain("REQ-FLOW-121");
    expect(verdict.reason).toContain("stamity run checkpoint");
  };
  /**
   * TEST CHANGE, justified (REQ-FLOW-138, a4): attended, these lines stay no person-only act, except where a stamity
   * command's argument holds an expansion the reading cannot settle, which may spell `--loosen`: that one now asks as
   * `autonomy-loosen`. The lines are listed, not derived, so the reader's own rule is what this pins.
   */
  const UNREADABLE_ARGUMENT = new Set([
    "npx --no stamity run end --run \"$RUN\"",
    "st run end --run \"$RUN\"",
    "PATH=/tmp/bin node dist/cli.js run \"$OPT\" end --run x",
    "PATH=/tmp/bin node dist/cli.js run $OPT end --run x",
  ]);
  const expectAttended = (command: string): void => {
    if (UNREADABLE_ARGUMENT.has(command)) {
      expect(personOnlyVerdict(command, ON_FEATURE), command).toMatchObject({ deny: true, rule: "autonomy-loosen", ask: true });
    } else expect(personOnlyVerdict(command, ON_FEATURE), command).toEqual({ deny: false });
  };

  it.each([
    // The forms SECURITY.md names that set a name the verb's git reads, before the verb (review/252's expansion under
    // zsh's `setopt -a` and `bash -a` among them).
    ["setopt -a; : ${GIT_CONFIG_GLOBAL=/tmp/c}; " + VERB, "an unquoted `;`"],
    ["bash -a -c ': ${GIT_CONFIG_GLOBAL=/tmp/c}; " + VERB + "'", "a first word other than `stamity`, `st` or `npx`"],
    ["readonly GIT_EXEC_PATH=/tmp/bin; " + VERB, "an unquoted `;`"],
    ["select GIT_EXEC_PATH in /tmp/bin; do " + VERB + "; done", "an unquoted `;`"],
    ["print -v GIT_EXEC_PATH /tmp/bin; " + VERB, "an unquoted `;`"],
    ["foreach GIT_EXEC_PATH (/tmp/bin) " + VERB + "; end", "an unquoted `(`"],
    [": ${GIT_EXEC_PATH:=/tmp/bin} && " + VERB, "an unquoted `$`"],
    ["source /tmp/env.sh && " + VERB, "an unquoted `&`"],
    // A nested verb, a trailing `&`, a redirection, a wrapper, the CLI file run by node, a prefix assignment.
    ["sh -c '" + VERB + "'", "a first word other than `stamity`, `st` or `npx`"],
    ["echo $(" + VERB + ")", "an unquoted `$`"],
    [VERB + " &", "an unquoted `&`"],
    [VERB + " > out.txt", "an unquoted `>`"],
    [VERB + " 2>&1 2>&1", "an unquoted `>`"],
    ["env -u GIT_EXEC_PATH " + VERB, "a first word other than `stamity`, `st` or `npx`"],
    ["node dist/cli.js run end --run x", "a first word other than `stamity`, `st` or `npx`"],
    ["NODE_OPTIONS=--require=/tmp/x.js " + VERB, "a first word other than `stamity`, `st` or `npx`"],
    [VERB + "\nnpm test", "a line break"],
    ["npx --no stamity run end --run \"$RUN\"", "inside double quotes"],
    // npx's own shape: the yes flag first, the registry a plain https URL, no other option, then `run <verb>`.
    ["npx stamity run end --run x", "an `npx` call whose first word is not"],
    ["npx -y --package=x stamity run end --run x", "an `npx` option or package other than"],
    ["npx --yes --@zomarit:registry=http://npm.example.com @zomarit/stamity@1.15.0 run end --run x", "a scope registry"],
    ["stamity --verbose run end --run x", "words between the program and `run <verb>`"],
  ])("refuses %j, naming what broke the shape", (command, broke) => {
    expectRefused(unattendedPushVerdict(command), broke);
    // Attended, the same line is what it was: no person-only act.
    expectAttended(command);
  });

  it.each([
    // PowerShell's `env:` drive written before the verb (review/236, review/245), a hashtable given to `Start-Process`
    // (review/246), the agent's own `pwsh -Command`, which loads a profile the run can write, a call operator, the
    // stop-parsing token, and a typographic quote closing a `'` in PowerShell.
    ["Set-Content env:GIT_EXEC_PATH C:/tmp; " + VERB, "an unquoted `;`"],
    ["Add-Content env:GIT_EXEC_PATH C:/tmp; " + VERB, "an unquoted `;`"],
    ["Copy-Item env:PATH env:GIT_EXEC_PATH; " + VERB, "an unquoted `;`"],
    ["Rename-Item env:OTHER GIT_EXEC_PATH; " + VERB, "an unquoted `;`"],
    ["Set-Item env:/GIT_EXEC_PATH C:/tmp; " + VERB, "an unquoted `;`"],
    ["Start-Process -Environment @{GIT_EXEC_PATH='C:/tmp'} npx -ArgumentList '--no stamity run end --run x'", "an unquoted `{`"],
    ["pwsh -Command '" + VERB + "'", "a first word other than `stamity`, `st` or `npx`"],
    ["& " + VERB, "an unquoted `&`"],
    [VERB + " --%", "stop-parsing"],
    ["npx --no stamity run end --run x --title 'a" + RSQ + "; Remove-Item x; " + RSQ + "b'", "a typographic quote"],
  ])("refuses the PowerShell line %j, read as PowerShell", (command, broke) => {
    expectRefused(unattendedPushVerdict(command, true), broke);
  });

  // review/93: `package.json` declares a second bin, `st`, for the same CLI. Each launch route the rows above cover for
  // `stamity` holds under `st`, and so does a launcher outside the reading's wrappers and runners, which only the text
  // backstop names.
  const ST = "st run end --run x";
  it.each([
    ["setopt -a; : ${GIT_CONFIG_GLOBAL=/tmp/c}; " + ST, "an unquoted `;`"],
    ["bash -a -c ': ${GIT_CONFIG_GLOBAL=/tmp/c}; " + ST + "'", "a first word other than `stamity`, `st` or `npx`"],
    ["readonly GIT_EXEC_PATH=/tmp/bin; " + ST, "an unquoted `;`"],
    ["select GIT_EXEC_PATH in /tmp/bin; do " + ST + "; done", "an unquoted `;`"],
    ["print -v GIT_EXEC_PATH /tmp/bin; " + ST, "an unquoted `;`"],
    ["foreach GIT_EXEC_PATH (/tmp/bin) " + ST + "; end", "an unquoted `(`"],
    [": ${GIT_EXEC_PATH:=/tmp/bin} && " + ST, "an unquoted `$`"],
    ["source /tmp/env.sh && " + ST, "an unquoted `&`"],
    ["sh -c '" + ST + "'", "a first word other than `stamity`, `st` or `npx`"],
    ["echo $(" + ST + ")", "an unquoted `$`"],
    [ST + " &", "an unquoted `&`"],
    [ST + " > out.txt", "an unquoted `>`"],
    [ST + " 2>&1 2>&1", "an unquoted `>`"],
    ["env -u GIT_EXEC_PATH " + ST, "a first word other than `stamity`, `st` or `npx`"],
    ["NODE_OPTIONS=--require=/tmp/x.js " + ST, "a first word other than `stamity`, `st` or `npx`"],
    [ST + "\nnpm test", "a line break"],
    ["st run end --run \"$RUN\"", "inside double quotes"],
    ["npx st run end --run x", "an `npx` call whose first word is not"],
    ["npx --no st run end --run x", "an `npx` option or package other than"],
    ["st --verbose run end --run x", "words between the program and `run <verb>`"],
    // Launchers the reading does not unwrap: only the backstop names the verb.
    ["parallel " + ST, "a first word other than `stamity`, `st` or `npx`"],
    ["watch " + ST, "a first word other than `stamity`, `st` or `npx`"],
    ["strace -f " + ST, "a first word other than `stamity`, `st` or `npx`"],
    ["flock /tmp/l " + ST, "a first word other than `stamity`, `st` or `npx`"],
    ["unbuffer ./node_modules/.bin/st run end --run x", "a first word other than `stamity`, `st` or `npx`"],
  ])("refuses %j under the second bin, naming what broke the shape (review/93)", (command, broke) => {
    expectRefused(unattendedPushVerdict(command), broke);
    expectAttended(command);
  });

  it.each([
    ["Set-Content env:GIT_EXEC_PATH C:/tmp; " + ST, "an unquoted `;`"],
    ["Add-Content env:GIT_EXEC_PATH C:/tmp; " + ST, "an unquoted `;`"],
    ["Copy-Item env:PATH env:GIT_EXEC_PATH; " + ST, "an unquoted `;`"],
    ["Rename-Item env:OTHER GIT_EXEC_PATH; " + ST, "an unquoted `;`"],
    ["Set-Item env:/GIT_EXEC_PATH C:/tmp; " + ST, "an unquoted `;`"],
    ["Start-Process -Environment @{GIT_EXEC_PATH='C:/tmp'} st -ArgumentList 'run end --run x'", "an unquoted `{`"],
    ["Start-Process -Environment @{GIT_EXEC_PATH='C:/tmp'} npx -ArgumentList '--no st run end --run x'", "an unquoted `{`"],
    ["Set-Content env:GIT_EXEC_PATH C:/tmp; Start-Process -FilePath st.cmd -ArgumentList 'run','end'", "an unquoted `;`"],
    ["pwsh -Command '" + ST + "'", "a first word other than `stamity`, `st` or `npx`"],
    ["& " + ST, "an unquoted `&`"],
    [ST + " --%", "stop-parsing"],
    [ST + " --title 'a" + RSQ + "; Remove-Item x; " + RSQ + "b'", "a typographic quote"],
  ])("refuses the PowerShell line %j under the second bin, read as PowerShell (review/93)", (command, broke) => {
    expectRefused(unattendedPushVerdict(command, true), broke);
  });

  it("reads a line that opens on a substitution once, not as its own nested line (review/94)", () => {
    // A program word holding a blank (the substitution read as a word) is read as a line of its own unless it is the
    // line itself; without that guard the reading recurses to its depth cap and refuses on every client.
    for (const command of ["$(echo git status) --short", "`echo git status` --short", "$(npm test)"]) {
      // TEST CHANGE, justified (REQ-FLOW-138, review/45): a program word built by a substitution splits into words the
      // line does not show, a loosening among them, so it asks as one; the reading itself still ends (no depth refusal).
      expect(personOnlyVerdict(command, ON_FEATURE), command).toMatchObject({ deny: true, rule: "autonomy-loosen", ask: true });
      expect(unattendedPushVerdict(command), command).toEqual({ deny: false });
    }
    // The twin: the same opening still shows an act the substitution holds.
    expect(personOnlyVerdict("$(git push --force origin feat/x) --short", ON_FEATURE)).toMatchObject({ deny: true, rule: "force-push" });
    expect(unattendedPushVerdict("$(git push origin feat/x) --short").deny).toBe(true);
  });

  it.each([
    ["npx --no stamity run end --run x"],
    ["npx --no-yes stamity run checkpoint --run x"],
    ["stamity run end --run x"],
    ["st run checkpoint --run x --pr --title 'a title; with words'"],
    ["npx -y @zomarit/stamity@1.15.0 run start --run x"],
    ["npx --yes --@zomarit:registry=https://npm.example.com @zomarit/stamity@1.15.0 run end --run x"],
    ["npx --no stamity run end --run x 2>&1"],
    ["npx --no stamity run checkpoint --run x --title \"a title\""],
    ["npm run start"],
  ])("allows %j, the verb alone or no verb, in both readings", (command) => {
    expect(unattendedPushVerdict(command)).toEqual({ deny: false });
    expect(unattendedPushVerdict(command, true)).toEqual({ deny: false });
  });

  // review/130: commander takes `run`'s options before its subcommand (`src/cli/commands/run.ts`), so a valued option
  // written as two words between `run` and the verb word still runs the verb. The trigger finds the verb after any
  // option words and their values, in the parse and in the text backstop, and the shape keeps the verb next to `run`.
  it.each([
    ["HOME=/tmp/h stamity run --run x end", "a first word other than `stamity`, `st` or `npx`"],
    ["PATH=/tmp/bin npx --no stamity run --title t checkpoint --run x", "a first word other than `stamity`, `st` or `npx`"],
    ["sh -c 'st run --run x end'", "a first word other than `stamity`, `st` or `npx`"],
    ["npx --no stamity run --run x --title 'a b' end; npm test", "an unquoted `;`"],
    ["env -u GIT_EXEC_PATH npx --no stamity run --paths a --run x checkpoint", "a first word other than `stamity`, `st` or `npx`"],
    // Launchers the reading does not unwrap: only the text backstop names the verb, after the option words.
    ["watch stamity run --run x end", "a first word other than `stamity`, `st` or `npx`"],
    ["parallel st run --title 'a b' --run x end", "a first word other than `stamity`, `st` or `npx`"],
    // The verb alone but after an option: outside the accepted shape, so refused, naming what broke it.
    ["npx --no stamity run --run x end", "words between `run` and its verb"],
  ])("refuses %j, a run verb after a valued option, naming what broke the shape (review/130)", (command, broke) => {
    expectRefused(unattendedPushVerdict(command), broke);
    expect(personOnlyVerdict(command, ON_FEATURE)).toEqual({ deny: false });
  });

  it.each([
    ["$env:HOME = 'C:/h'; npx --no stamity run --run x end", "an unquoted `$`"],
    ["Set-Content env:GIT_CONFIG_GLOBAL C:/c; st run --title t end --run x", "an unquoted `;`"],
  ])("refuses the PowerShell line %j, a run verb after a valued option (review/130)", (command, broke) => {
    expectRefused(unattendedPushVerdict(command, true), broke);
  });

  // review/130, round 3: forms the parse does not normalize (the CLI file started by `node`, a launcher it does not
  // unwrap) are found over each parsed command's decoded words, joined, so a quoted value holding a separator does not
  // end the option words early, an escaped dash reads as a dash, and a first word the reading cannot settle counts.
  it.each([
    ["PATH=/tmp/bin node dist/cli.js run --title 'a;b' end --run x", "a first word other than `stamity`, `st` or `npx`"],
    ["HOME=/tmp/h node dist/cli.js run --title 'a|b' checkpoint --run x", "a first word other than `stamity`, `st` or `npx`"],
    ["XDG_CONFIG_HOME=/tmp/c node dist/cli.js run --title 'a&b' end --run x", "a first word other than `stamity`, `st` or `npx`"],
    ["PATH=/tmp/bin node dist/cli.js run --title 'a\nb' end --run x", "a line break"],
    ["PATH=/tmp/bin node dist/cli.js run $'\\x2d-run' x end", "an unquoted `$`"],
    ["PATH=/tmp/bin node dist/cli.js run $'\\055-run' x end", "an unquoted `$`"],
    ["parallel st run --title 'a;b' end --run x", "a first word other than `stamity`, `st` or `npx`"],
    ["watch 'node dist/cli.js run --title \"a;b\" end --run x'", "a first word other than `stamity`, `st` or `npx`"],
    // Unsure: an expansion after `run` may be an option word, so the verb after it counts.
    ["PATH=/tmp/bin node dist/cli.js run \"$OPT\" end --run x", "inside double quotes"],
    ["PATH=/tmp/bin node dist/cli.js run $OPT end --run x", "an unquoted `$`"],
  ])("refuses %j, a run verb after option words only the decoded words show (review/130)", (command, broke) => {
    expectRefused(unattendedPushVerdict(command), broke);
    expectAttended(command);
  });

  it.each([
    ["node dist/cli.js run --title 'a;b' end --run x", "a first word other than `stamity`, `st` or `npx`"],
    ["node dist/cli.js run @opts end --run x", "a first word other than `stamity`, `st` or `npx`"],
  ])("refuses the PowerShell line %j, a run verb after option words only the decoded words show (review/130)", (command, broke) => {
    expectRefused(unattendedPushVerdict(command, true), broke);
  });

  it.each([
    // Non-degenerate twins: the word after `run` is a plain one, no verb follows the options, or prose names the words.
    ["node dist/cli.js run --title 'a;b' end", "node dist/cli.js run lint end"],
    ["node dist/cli.js run --title 'a;b' end", "node dist/cli.js run --title 'a;b'"],
    ["git commit -m x; node dist/cli.js run --title 'a;b' end", "git commit -m 'stamity: run the tests; then end'"],
  ])("refuses %j and lets %j pass, in both readings (review/130)", (refused, passes) => {
    for (const powershell of [false, true]) {
      expect(unattendedPushVerdict(refused, powershell).deny, refused).toBe(true);
      expect(unattendedPushVerdict(passes, powershell), passes).toEqual({ deny: false });
    }
  });

  // review/131: PowerShell splats `@name` into a native command's arguments and splits words on blanks other than a
  // space or a tab, so a stop-parsing token set off by one, or spelled with its typographic dashes, is still one.
  const BLANKS = [0x0b, 0x0c, 0x85, 0xa0, 0x2002, 0x3000].map((code) => String.fromCharCode(code));
  const DASHES = [0x2013, 0x2014, 0x2015].map((code) => String.fromCharCode(code));
  it.each([
    [VERB + " @rest", "an unquoted `@`"],
    [VERB + " --title a,@rest", "an unquoted `@`"],
    ...BLANKS.map((blank) => [VERB + blank + "--% --title %T%", "a blank other than a space or a tab"]),
    ...DASHES.map((dash) => [VERB + " " + dash + dash + "% --title %T%", "stop-parsing"]),
    [VERB + " -" + DASHES[0] + "% --title %T%", "stop-parsing"],
  ])("refuses the PowerShell line %j, whose words the guard does not read as PowerShell does (review/131)", (command, broke) => {
    expectRefused(unattendedPushVerdict(command, true), broke);
  });

  it("refuses an unquoted `@` after the verb in PowerShell, and lets a quoted one and the package's own pass (review/131)", () => {
    expectRefused(unattendedPushVerdict(VERB + " --title @rest", true), "an unquoted `@`");
    // Non-degenerate twins: single and double quotes keep `@` literal, and the pinned package and its registry keep
    // theirs, in both readings.
    for (const command of [
      VERB + " --title '@rest'",
      VERB + ' --title "a@b"',
      "npx --yes --@zomarit:registry=https://npm.example.com @zomarit/stamity@1.15.0 run end --run x",
    ]) {
      expect(unattendedPushVerdict(command), command).toEqual({ deny: false });
      expect(unattendedPushVerdict(command, true), command).toEqual({ deny: false });
    }
  });

  it("reads `@` and the other blanks as literals in the shell reading, and refuses them in PowerShell's (review/131)", () => {
    for (const command of [VERB + " --title a@b", VERB + " --title a" + String.fromCharCode(0xa0) + "b"]) {
      expect(unattendedPushVerdict(command), command).toEqual({ deny: false });
      expect(unattendedPushVerdict(command, true).deny, command).toBe(true);
    }
  });

  it("refuses `gh extension exec` under each of its names, and lets the group's reads pass (pr/64)", () => {
    for (const command of ["gh ext exec x", "gh extension exec x", "gh extensions exec my-ext --flag"]) {
      const verdict = unattendedPushVerdict(command);
      expect(verdict.deny, command).toBe(true);
      if (verdict.deny) expect(verdict.reason, command).toContain("which runs an extension");
      expect(personOnlyVerdict(command, ON_FEATURE), command).toEqual({ deny: false });
    }
    for (const command of ["gh ext list", "gh extension list", "gh extensions browse"]) {
      expect(unattendedPushVerdict(command), command).toEqual({ deny: false });
    }
  });

  it("refuses a line that sets SSH_ASKPASS, which git and the ssh it starts run as a program (v0b)", () => {
    for (const command of ["SSH_ASKPASS=/tmp/a git fetch", "export SSH_ASKPASS=/tmp/a; npm test", "$env:SSH_ASKPASS = 'C:/a'; npm test"]) {
      expect(unattendedPushVerdict(command).deny, command).toBe(true);
    }
    // The twins: a line that only names it, and one that sets another name.
    for (const command of ["echo $SSH_ASKPASS", "export SSH_AUTH_SOCK=/tmp/s; npm test"]) {
      expect(unattendedPushVerdict(command), command).toEqual({ deny: false });
    }
  });

  it("reads PowerShell's typographic quotes as quotes, so an act after one is read in both verdicts (v0b, W-1)", () => {
    const [LSQ, RSQ2, LDQ, RDQ] = [0x2018, 0x2019, 0x201c, 0x201d].map((code) => String.fromCharCode(code));
    /** The PowerShell tool's text as the guard reads it: beside itself, inside a synthetic `pwsh -Command`. */
    const asTool = (text: string): string => `pwsh -Command '${text.replaceAll("'", "'\\''")}'`;
    const single = `echo 'a${RSQ2}; git push --force origin feat/x; ${LSQ}b'`;
    const double = `echo "a${RDQ}; git push --force origin feat/x; ${LDQ}b"`;
    for (const text of [single, double]) {
      expect(personOnlyVerdict(asTool(text), ON_FEATURE), text).toMatchObject({ deny: true, rule: "force-push" });
      expect(unattendedPushVerdict(text, true).deny, text).toBe(true);
      // Read as a POSIX shell, the same text holds one quoted word: only PowerShell's reading shows the push.
      expect(personOnlyVerdict(text, ON_FEATURE), text).toEqual({ deny: false });
    }
    // The twin: typographic quotes around plain words hide nothing.
    expect(personOnlyVerdict(asTool(`echo 'a${RSQ2} ${LSQ}b'; git status`), ON_FEATURE)).toEqual({ deny: false });
  });

  it("restates the CLI's registry URL rule, so the scope registry a pinned call renders is the one accepted", () => {
    const source = readFileSync(fileURLToPath(new URL("../../src/hooks/personOnly.ts", import.meta.url)), "utf8");
    expect(source).toContain(`const REGISTRY_URL = /${REGISTRY_URL.source}/;`);
  });
});

describe("unattendedPushVerdict", () => {
  it.each([
    ["git push origin HEAD:refs/heads/x"],
    ["git push"],
    ["git push -u origin feat/x"],
    ["git -c a=b push origin feat/x"],
    ["npm test && git push origin feat/x"],
    ["git send-pack origin HEAD"],
    ["git subtree push --prefix=dist origin gh-pages"],
    ["git subtree push -P dist origin x"],
    ["sudo -u root git push origin feat/x"],
    // git's dashed program form (build/49) and a runner's one-word command line (build/51).
    ["git-push origin feat/x"],
    ["/usr/libexec/git-core/git-send-pack origin HEAD"],
    ["bun exec 'git push origin feat/x'"],
    ["yarn exec 'git push'"],
    ["gh pr create --draft --title t --body-file b.md"],
    ["gh pr new --draft --title t --body-file b.md"],
    ["gh pr edit 3 --body-file b.md"],
    ["gh repo sync"],
    // `gh repo create` pushing the local repository to the repository it creates (review/109), and its alias `new`
    // (review/129, read from gh 2.102.0's help).
    ["gh repo create o/new --private --source . --push"],
    ["gh repo create --source=. --public --push"],
    ["gh repo new o/new --private --source . --push"],
    ["gh repo new --source=. --public --push=true"],
    // A push inside PowerShell's command string (build/89), and a percent-encoded contents path (build/76).
    ["pwsh -c 'git push origin feat/x'"],
    ["powershell -NoProfile -Command \"gh pr create --draft --fill\""],
    ["iex 'git push'"],
    ["gh api -X PUT repos/o/r/%63ontents/a.yml"],
    // A git call defining an alias, and a subcommand that is no builtin: an alias from the configuration, a computed
    // or variable name, a dashed program git does not build in (the 01:50Z sign-off, u21's review).
    ["git -c alias.p=push p origin feat/x"],
    ["git -c alias.st='!git push' status"],
    ["git p origin feat/x"],
    ["git $SUB origin feat/x"],
    ["git \"$(echo push)\" origin feat/x"],
    ["git-p origin feat/x"],
    // `git lfs` and `git submodule` outside their read and setup forms (review/187): the LFS upload and a line run in
    // every submodule.
    ["git lfs push origin feat/x"],
    ["git submodule foreach 'git push origin HEAD:refs/heads/x'"],
    // The MOVES rows with no pin before (review/110).
    ["gh api -X PUT repos/o/r/pulls/3/merge"],
    ["gh api -X POST repos/o/r/git/tags -f tag=v1 -f object=abc -f type=commit"],
    ["gh api -X PUT repos/o/r/contents/a.yml"],
    ["gh api -X PATCH repos/o/r/git/refs/heads/x"],
    ["gh api repos/o/r/git/refs -f ref=refs/heads/x -f sha=abc"],
    ["gh api -X POST repos/o/r/git/commits --input c.json"],
    ["gh api -X POST repos/o/r/git/trees --input t.json"],
    ["gh api -X POST repos/o/r/git/blobs -f content=x"],
    ["gh api -X POST repos/o/r/pulls -f title=t -f head=x -f base=main"],
    ["gh api -X PATCH repos/o/r/pulls/3 -f body=x"],
    ["gh api -X PUT repos/o/r/pulls/3/update-branch"],
    ["gh api -X POST repos/o/r/merges -f base=feat/x -f head=main"],
    ["gh api -X POST repos/o/r/merge-upstream -f branch=main"],
    ["gh api -X POST repos/o/r/branches/x/rename -f new_name=y"],
    ["curl -X POST -d @pr.json https://api.github.com/repos/o/r/pulls"],
    ["curl -d @c.json https://api.github.com/repos/o/r/git/commits"],
    ["wget --method=PATCH https://api.github.com/repos/o/r/pulls/3"],
    ["gh api graphql -f query='mutation { createCommitOnBranch(input: {}) { commit { oid } } }'"],
    ["gh api graphql -f query='mutation { createPullRequest(input: {}) { pullRequest { id } } }'"],
    // A push inside `cmd /c` (review/183), a rebase's exec line or a bisect's command (review/184), a script block
    // (review/185).
    ["cmd /c git push --force origin feat/x"],
    ["git rebase --exec 'git push --force origin feat/x' main"],
    ["git bisect run git push --force origin feat/x"],
    ["Invoke-Command -ScriptBlock {git push --force origin feat/x}"],
    // A push through a Windows-path git in PowerShell's command string (review/194).
    ["pwsh -c 'C:\\Git\\bin\\git.exe push origin feat/x'"],
    // A configuration pair outside the display and identity keys, on the line or through the environment, which git
    // can run as a line (the 02:31Z sign-off).
    ["git -c core.fsmonitor='git push origin HEAD:refs/heads/x' status"],
    ["git -c core.sshCommand='sh -c \"git push origin x\"' fetch"],
    ["git --config-env=core.fsmonitor=HOOK status"],
    ["GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.fsmonitor GIT_CONFIG_VALUE_0='git push origin x' git status"],
    ["export GIT_CONFIG_PARAMETERS=\"'core.fsmonitor=git push'\"; git status"],
    // The same variables as the reading decodes them (review/221): quoted or escaped, after `env` or `export`, inside a
    // nested line.
    ["env GIT_CONF''IG_COUNT=1 GIT_CONF''IG_KEY_0=core.sshCommand GIT_CONFIG_VALUE_0=x git fetch"],
    ["env $'GIT\\x5fCONFIG_PARAMETERS=x' git status"],
    ["export GIT_CONF\"\"IG_COUNT=1; git status"],
    ["sh -c 'GIT_CONF\"\"IG_KEY_0=core.fsmonitor git status'"],
    // The same variables named in whatever form sets them (review/227, review/196): PowerShell's braced `${env:…}`, its
    // `Set-Item` and `New-Item` on the `env:` drive and `[Environment]::SetEnvironmentVariable`, a value variable
    // alone, an `export` of a name set earlier, a pair's number or a name the line computes, and a commit message
    // naming one, which the text cannot tell from a setting (the 02:31Z sign-off's choice).
    ["${env:GIT_CONFIG_PARAMETERS}=\"'core.fsmonitor=git push origin x'\"; git status"],
    ["${env:GIT_CONFIG_COUNT} = 1; git status"],
    ["Set-Item env:GIT_CONFIG_COUNT 1; Set-Item env:GIT_CONFIG_KEY_0 core.fsmonitor; Set-Item env:GIT_CONFIG_VALUE_0 'git push origin x'; git status"],
    ["New-Item -Path env:GIT_CONFIG_PARAMETERS -Value x; git status"],
    ["[Environment]::SetEnvironmentVariable('GIT_CONFIG_PARAMETERS', 'x'); git status"],
    ["GIT_CONFIG_VALUE_0='git push origin x' git status"],
    ["export GIT_CONFIG_COUNT; git status"],
    ["export GIT_CONFIG_KEY_$i=core.fsmonitor; git status"],
    ["v=PARAMETERS; export \"GIT_CONFIG_$v=x\"; git status"],
    ["git commit -m 'GIT_CONFIG_COUNT is left unset'"],
    // Closing or reopening a pull request, the REST twin's `PATCH pulls/<n>` (review/213).
    ["gh pr close 3"],
    ["gh pr reopen 3"],
    ["gh -R o/r pr close 3 -c done"],
    // GitHub merging the base into a pull request's branch, the REST twin's `PUT pulls/<n>/update-branch` (review/232).
    ["gh pr update-branch 3"],
    ["gh pr update-branch 3 --rebase"],
    ["gh -R o/r pr update-branch 3"],
    // The file git reads in place of the global or system configuration, set or named on a git call's line (review/233),
    // and a commit message naming one, which the text cannot tell from a setting (review/227's choice); the message row
    // was allowed before review/233.
    ["GIT_CONFIG_GLOBAL=/tmp/c git fetch"],
    ["GIT_CONFIG_SYSTEM=/tmp/c git fetch"],
    ["$env:GIT_CONFIG_GLOBAL = 'C:\\c'; git fetch"],
    ["git commit -m 'GIT_CONFIG_GLOBAL is left unset'"],
    // One of git's program or configuration variables set on a line whatever program it runs (review/231): the run
    // verb's own push reads it, in each spelling of the verb, and in each setting form. `GIT_EDITOR=/tmp/e npm test` and
    // the two `npm test` lines setting `GIT_CONFIG_COUNT` were allowed before review/231: a program the line starts can
    // start git with them.
    ["GIT_EXEC_PATH=/tmp/bin stamity run end --run x"],
    ["GIT_EXEC_PATH=/tmp/bin npx --no stamity run end --run x"],
    ["GIT_EXEC_PATH=/tmp/bin node dist/cli.js run end --run x"],
    ["GIT_EDITOR=/tmp/e npm test"],
    ["env GIT_CONF''IG_COUNT=1 npm test"],
    ["Set-Item env:GIT_CONFIG_COUNT 1; npm test"],
    ["env GIT_ASKPASS=/tmp/a npx --no stamity run checkpoint --run x"],
    ["sudo -u root GIT_SSH_COMMAND=/tmp/s npx --no stamity run end --run x"],
    ["sh -c 'GIT_EXEC_PATH=/tmp/bin stamity run end --run x'"],
    ["export GIT_SSH_COMMAND=/tmp/s; npx --no stamity run end --run x"],
    ["export GIT_EXEC_PATH; npx --no stamity run end --run x"],
    ["declare -x GIT_EXEC_PATH=/tmp/bin; npx --no stamity run end --run x"],
    // A `declare`, `typeset` or `local` whose option cluster carries `x` exports a name with no `=` as `export` does,
    // its value set by a command that is no assignment (review/243): each cluster, the option before and after `--`
    // (read wherever it stands, the safe direction), and several names on one line.
    ["read GIT_EXEC_PATH <<< /tmp/bin; declare -x GIT_EXEC_PATH; npx --no stamity run end --run x"],
    ["printf -v GIT_SSH_COMMAND /tmp/s; declare -gx GIT_SSH_COMMAND; npx --no stamity run end --run x"],
    ["read GIT_CONFIG_COUNT <<< 1; typeset -rx GIT_CONFIG_COUNT; npm test"],
    ["f() { local -xr GIT_EXEC_PATH; npx --no stamity run end --run x; }; f"],
    ["for GIT_EDITOR in /tmp/e; do :; done; declare -x -- GIT_EDITOR; npm test"],
    ["typeset -- -x GIT_PAGER; npm test"],
    ["declare -x HOME GIT_EXEC_PATH PATH; npx --no stamity run end --run x"],
    ["typeset -gx GIT_CONFIG_KEY_0 GIT_CONFIG_VALUE_0; npx --no stamity run end --run x"],
    // A form that assigns a name with no `=` (review/247): under allexport, or with the name already in the
    // environment, the verb's git sees it. The reported line, then each form: `read` (an option, `-a`, a second name),
    // `for NAME in`, `printf -v` (apart and attached), `mapfile`, `readarray`, `getopts`.
    ["set -a; read GIT_EXEC_PATH <<< /tmp/bin; npx --no stamity run end --run x"],
    ["read -r GIT_EXEC_PATH <<< /tmp/bin; npx --no stamity run end --run x"],
    ["read -a GIT_SSH_COMMAND <<< /tmp/s; npm test"],
    ["read -r HOME GIT_EDITOR < /tmp/v; npm test"],
    ["for GIT_EXEC_PATH in /tmp/bin; do npx --no stamity run end --run x; done"],
    ["printf -v GIT_EXEC_PATH %s /tmp/bin; npx --no stamity run end --run x"],
    ["printf -vGIT_PAGER %s /tmp/p; npm test"],
    ["mapfile -t GIT_CONFIG_KEY_0 < /tmp/k; npm test"],
    ["readarray GIT_EXEC_PATH < /tmp/p; npx --no stamity run end --run x"],
    ["getopts e: GIT_EDITOR -e /tmp/e; npm test"],
    // allexport turned on, on a line naming one anywhere: a form the list above does not read is exported too.
    ["set -o allexport; select GIT_EXEC_PATH in /tmp/bin; do break; done; npx --no stamity run end --run x"],
    ["set -ea; select GIT_EXEC_PATH in /tmp/bin; do break; done; npx --no stamity run end --run x"],
    ["setopt ALL_EXPORT; print -v GIT_EXEC_PATH /tmp/bin; npx --no stamity run end --run x"],
    ["shopt -so allexport; select GIT_PAGER in /tmp/p; do break; done; npm test"],
    ["cmd /c \"set GIT_EXEC_PATH=C:\\tmp&& npx --no stamity run end --run x\""],
    ["$env:GIT_EXEC_PATH = 'C:\\tmp'; npx --no stamity run end --run x"],
    ["$env:GIT_EXEC_PATH+='C:\\tmp'; npx --no stamity run end --run x"],
    ["${env:GIT_EXEC_PATH}='C:\\tmp'; npx --no stamity run end --run x"],
    ["Set-Item -Path env:GIT_EXEC_PATH -Value C:\\tmp; npx --no stamity run end --run x"],
    ["New-Item env:\\GIT_SSH -Value C:\\s; npx --no stamity run end --run x"],
    ["[Environment]::SetEnvironmentVariable('GIT_EXEC_PATH', 'C:\\tmp'); npx --no stamity run end --run x"],
    ["GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.sshCommand GIT_CONFIG_VALUE_0=/tmp/s npx --no stamity run end --run x"],
    ["export GIT_CONFIG_PARAMETERS=\"'core.sshCommand=/tmp/s'\"; npx --no stamity run end --run x"],
    ["export GIT_CONFIG_KEY_$i=core.sshCommand; npx --no stamity run end --run x"],
    ["GIT_CONFIG_GLOBAL=/tmp/c npx --no stamity run end --run x"],
    // A program-valued git variable set on a git call's line (review/208): each of the nine, and the spellings the
    // reading handles — after a wrapper, quoted or escaped, after `export`, inside a nested line, PowerShell's `$env:`
    // and `${env:…}`, another letter case, and after the git call.
    ["GIT_EDITOR='git push origin x' git commit"],
    ["GIT_SEQUENCE_EDITOR='sh -c \"git push origin x\"' git rebase -i main"],
    ["GIT_SSH_COMMAND='sh -c \"git push origin x\"' git fetch"],
    ["GIT_SSH=/tmp/ssh git fetch"],
    ["GIT_EXTERNAL_DIFF=/tmp/diff git diff"],
    ["GIT_ASKPASS=/tmp/askpass git fetch"],
    ["GIT_PAGER='git push origin x' git --paginate log"],
    ["GIT_PROXY_COMMAND=/tmp/proxy git fetch"],
    ["GIT_EXEC_PATH=/tmp/bin git status"],
    ["env GIT_EDITOR=/tmp/e git commit"],
    ["sudo -u root GIT_EDITOR=/tmp/e git commit"],
    ["env GIT_EDI''TOR=/tmp/e git commit"],
    ["env $'GIT\\x5fEDITOR=/tmp/e' git commit"],
    ["export GIT_EDITOR=/tmp/e; git commit"],
    ["export GIT_EDI\"\"TOR=/tmp/e; git commit"],
    ["sh -c 'GIT_EDITOR=/tmp/e git commit'"],
    ["$env:GIT_EDITOR = '/tmp/e'; git commit"],
    ["${env:GIT_SSH_COMMAND}='/tmp/s'; git fetch"],
    ["git_editor=/tmp/e git commit"],
    ["git status; GIT_EDITOR=/tmp/e git commit"],
    // A write of a git remote (review/209): each `git remote` write, `rm` (git's alias for `remove`) and an option
    // before the subcommand among them, and each `git config` write of a `remote.*` key or section, in the option
    // forms and the subcommands, any scope or file, and an edit of the file, which can write any key.
    ["git remote add fork https://example.com/r.git"],
    ["git remote set-url origin https://example.com/r.git"],
    ["git remote set-url --push origin https://example.com/r.git"],
    ["git remote -v set-url origin https://example.com/r.git"],
    ["git remote rename origin old"],
    ["git remote remove origin"],
    ["git remote rm origin"],
    ["git remote set-head origin -a"],
    ["git remote set-branches origin main"],
    ["git config remote.origin.url https://example.com/r.git"],
    ["git config set remote.origin.url https://example.com/r.git"],
    ["git config set --append remote.origin.pushurl https://example.com/r.git"],
    ["git config --add remote.origin.pushurl https://example.com/r.git"],
    ["git config --replace-all remote.origin.url https://example.com/r.git"],
    ["git config --unset remote.origin.pushurl"],
    ["git config unset remote.origin.url"],
    ["git config --rename-section remote.origin remote.old"],
    ["git config --rename-section old remote.origin"],
    ["git config rename-section remote.origin remote.old"],
    ["git config --remove-section remote.origin"],
    ["git config remove-section remote.origin"],
    ["git config --global remote.pushDefault fork"],
    ["git config -f .git/config remote.origin.url https://example.com/r.git"],
    ["git config --file=.git/config remote.origin.url https://example.com/r.git"],
    ["git config --type=bool remote.origin.mirror true"],
    ["git config --edit"],
    ["git config -e"],
    ["git config edit --local"],
    // A `git config` write of a `url.*` key (review/220): `insteadOf` and `pushInsteadOf` rewrite where a remote fetches
    // and pushes without naming a `remote.*` key, in the option forms and the subcommands, any scope.
    ["git config url.https://example.com/.pushInsteadOf https://github.com/"],
    ["git config --global url.git@example.com:.insteadOf https://github.com/"],
    ["git config set url.https://example.com/.insteadOf https://github.com/"],
    ["git config --add url.https://example.com/.pushInsteadOf https://github.com/"],
    ["git config --unset url.https://example.com/.insteadOf"],
    ["git config --remove-section url.https://example.com/"],
    // A runner behind a package manager's options (pr/3), the interpreter's caret escape (pr/10), wget's shortened
    // method and body options (pr/11).
    ["npm -w x exec -- git push origin feat/x"],
    ["pnpm --filter x exec git push"],
    ["npm --loglevel silly exec -- git push origin feat/x"],
    ["cmd /c g^it push origin feat/x"],
    ["wget --meth=PATCH https://api.github.com/repos/o/r/pulls/3"],
    ["wget --me PATCH https://api.github.com/repos/o/r/pulls/3"],
    ["wget --post-d x https://api.github.com/repos/o/r/pulls"],
    // wget's wgetrc commands (pr/23).
    ["wget -e method=PATCH https://api.github.com/repos/o/r/pulls/3"],
    ["wget -e post_data=x https://api.github.com/repos/o/r/pulls"],
    // A gh group outside gh's built-in commands (an alias or an extension), and an alias defined (pr/56).
    ["gh land 123"],
    ["gh -R o/r land 123"],
    ["gh alias set land 'pr merge'"],
    ["gh alias import aliases.yml"],
    // A group spelled near one of gh's own aliases (pr/67).
    ["gh exts list"],
    // A push behind Corepack's runner (pr/51), and the merge queue's enrolment (pr/57).
    ["corepack pnpm exec git push origin feat/x"],
    ["gh api graphql -f query='mutation { enqueuePullRequest(input: {pullRequestId: \"x\"}) { mergeQueueEntry { id } } }'"],
    // A pull request moved by curl's first request, a later `--next` read setting the method no longer hiding it (pr/72).
    ["curl -X PATCH https://api.github.com/repos/o/r/pulls/3 --next -X GET https://example.com"],
    ["curl -X PATCH https://api.github.com/repos/o/r/pulls/3 -: https://example.com"],
    // A pull request opened, and a commit written, through curl's attached body (pr/81).
    ["curl -d'{\"title\":\"x\",\"head\":\"a\",\"base\":\"main\"}' https://api.github.com/repos/o/r/pulls"],
    ["curl -sd@./c.json https://api.github.com/repos/o/r/contents/x"],
    // A pull request moved through a short cluster's method, gh's among them (pr/83, round 4d).
    ["curl -oX -X PATCH https://api.github.com/repos/o/r/pulls/3"],
    ["gh api -iXPATCH repos/o/r/pulls/3"],
    ["gh api -X=PATCH repos/o/r/pulls/3"],
    ["wget -qd https://api.github.com/repos/o/r/pulls/3 --method=PATCH"],
    // A pull request moved, and one opened, through curl's long-option prefixes (pr/84).
    ["curl --req PATCH https://api.github.com/repos/o/r/pulls/3"],
    ["curl --dat '{\"title\":\"x\",\"head\":\"a\",\"base\":\"main\"}' https://api.github.com/repos/o/r/pulls"],
    // A contents write and a pull request moved through a dot segment, read resolved as curl sends it (pr/93).
    ["gh api -X PUT repos/o/r/x/../contents/a.yml"],
    ["curl -X PATCH https://api.github.com/repos/o/r/tmp/../pulls/3"],
    ["gh api -X PUT repos/o/r/./git/refs/heads/feat"],
  ])("denies %j, naming the run verbs", (command) => {
    const verdict = unattendedPushVerdict(command);
    expect(verdict.deny).toBe(true);
    if (verdict.deny) {
      expect(verdict.reason).toContain("stamity run checkpoint");
      expect(verdict.reason).toContain("run end");
    }
  });

  it.each([
    ["npx --no stamity run end --run x"],
    ["npx --no stamity run checkpoint --run x --pr --title t"],
    ["gh api repos/o/r/pulls/3/comments -F in_reply_to=1 -F body=@reply.md"],
    ["gh api -X POST repos/o/r/issues/3/comments -F body=@reply.md"],
    ["gh api repos/o/r/pulls/3"],
    ["gh api repos/o/r/contents/a.yml"],
    ["gh pr view 3"],
    ["gh pr list"],
    ["gh pr status"],
    ["gh repo create o/new --private"],
    ["gh repo create o/new --private --source . --remote upstream"],
    ["gh repo new o/new --private"],
    ["pwsh -c 'git fetch origin'"],
    ["iex 'gh pr view 3'"],
    ["gh api repos/o/r/%63ontents/a.yml"],
    ["gh api repos/o/r/pulls/3/merge"],
    ["gh api repos/o/r/git/tags/abc"],
    ["git-fetch origin"],
    ["bun exec 'git fetch origin'"],
    ["git fetch origin"],
    // The alias rule's twins: a builtin, a `-c` pair that defines no alias, and git with no subcommand.
    ["git status"],
    ["git -c color.ui=never status"],
    ["git log --oneline -1"],
    ["git --version"],
    ["git subtree split --prefix=dist -b split"],
    ["git subtree add -P push origin x"],
    // The read and setup forms of `git lfs` and `git submodule` (review/187).
    ["git lfs fetch origin"],
    ["git lfs pull"],
    ["git lfs install --local"],
    ["git lfs ls-files"],
    ["git lfs env"],
    ["git lfs status"],
    ["git submodule status --recursive"],
    ["git submodule init"],
    ["git submodule --quiet update --init --recursive"],
    ["git submodule sync --recursive"],
    ["git commit -m 'git push later'"],
    ["echo 'git push'"],
    ["curl https://api.github.com/repos/o/r/pulls"],
    // The twins of review/183, review/184 and review/185.
    ["cmd /c git status"],
    ["git rebase --exec 'git status' main"],
    ["git bisect run git status"],
    ["Invoke-Command -ScriptBlock {git status}"],
    // The twins of review/194 and of the 02:31Z sign-off.
    ["pwsh -c 'C:\\Git\\bin\\git.exe status'"],
    ["git -c color.ui=never status"],
    ["git -c user.name=x commit -m m"],
    ["git -c user.email=x@example.com -c core.quotePath=false -c advice.detachedHead=false status"],
    // review/213's twins: the pull request read, listed, checked and commented on.
    ["gh pr list --state closed"],
    ["gh pr checks 3"],
    ["gh pr comment 3 --body-file reply.md"],
    // review/208's twins: a variable git reads that runs nothing, one unset, and a commit message naming one. A program
    // variable set on a line with no git call is refused since review/231 (above).
    ["GIT_TRACE=1 git status"],
    ["GIT_TERMINAL_PROMPT=0 git fetch origin"],
    ["env -u GIT_EDITOR git commit -m m"],
    ["git commit -m 'GIT_EDITOR is left unset'"],
    // review/231's twins: a line with no git call that only names one of the variables, reads or unsets it, or sets a
    // variable outside the set, the run verb's line among them.
    ["grep GIT_CONFIG_COUNT src"],
    ["grep -rn GIT_EXEC_PATH src"],
    ["rg 'GIT_EDITOR=' src"],
    ["echo $GIT_EXEC_PATH"],
    // TEST CHANGE, justified (v0b, REQ-FLOW-121): these twins ended in the run verb, which now stands alone on its line
    // unattended, so each is retargeted to `npm test` and still pins the line-wide rule's allowed neighbour; the verb's
    // own line is pinned in the stand-alone block below.
    ["env -u GIT_EXEC_PATH npm test"],
    ["GIT_TERMINAL_PROMPT=0 npm test"],
    ["export GIT_TRACE=1; npm test"],
    ["Get-Item env:GIT_EXEC_PATH; npm test"],
    ["$env:GIT_EXEC_PATH; npm test"],
    ["${env:GIT_CONFIG_NOSYSTEM}='1'; npm test"],
    ["Set-Item env:GIT_CONFIG_NOSYSTEM 1; npm test"],
    // review/243's twins: a `declare` that prints one, exports a variable outside the set, or gives one an attribute
    // other than `x`.
    ["declare -p GIT_EXEC_PATH; npm test"],
    ["declare -x GIT_TERMINAL_PROMPT; npm test"],
    ["typeset -i GIT_CONFIG_COUNT; npm test"],
    // review/247's twins: a name outside the set read, one only read from (not assigned), allexport turned off and a
    // `set` cluster with no `a` on a line naming one, and one named as `for`'s word or `printf`'s argument, no name.
    ["read OTHER_NAME <<< /tmp/bin; npm test"],
    ["echo \"$GIT_EXEC_PATH\"; npm test"],
    ["set +a; read OTHER_NAME <<< \"$GIT_EXEC_PATH\"; npm test"],
    ["set -e; echo \"$GIT_EXEC_PATH\"; npm test"],
    ["for f in GIT_EXEC_PATH GIT_EDITOR; do grep -rn \"$f\" src; done; npm test"],
    ["printf '%s\\n' GIT_EXEC_PATH; npm test"],
    // review/232's twin: the pull request's merge state read.
    ["gh pr view 3 --json mergeStateStatus"],
    // review/209's twins: every `git remote` read, and `git config` reads of a `remote.*` key, writes of another key,
    // and a value that merely starts as a remote key does.
    ["git remote"],
    ["git remote -v"],
    ["git remote get-url origin"],
    ["git remote get-url --push origin"],
    ["git remote show origin"],
    ["git remote update"],
    ["git remote prune origin"],
    ["git config remote.origin.url"],
    ["git config --get remote.origin.url"],
    ["git config get remote.origin.url"],
    ["git config --get-all remote.origin.fetch"],
    ["git config --get-regexp '^remote\\.'"],
    ["git config -f .git/config --get remote.origin.url"],
    ["git config --list"],
    ["git config -l"],
    ["git config list --show-origin"],
    ["git config user.name bot"],
    ["git config set user.email bot@example.com"],
    ["git config user.email remote.bot@example.com"],
    // review/220's twins: reads of a `url.*` key, and a value that merely starts as one does.
    ["git config --get url.https://example.com/.insteadOf"],
    ["git config --get-regexp '^url\\.'"],
    ["git config --get-urlmatch http https://example.com"],
    ["git config user.email url.bot@example.com"],
    // review/221's and review/227's twins: a git variable that sets no configuration, in PowerShell's spellings too, and
    // a commit message naming another git variable or a longer name. A commit message naming one of the variables is
    // refused since review/227, and the variables set on a line with no git call since review/231 (above).
    ["GIT_CONFIG_NOSYSTEM=1 git status"],
    ["${env:GIT_CONFIG_NOSYSTEM}='1'; git status"],
    ["Set-Item env:GIT_CONFIG_NOSYSTEM 1; git status"],
    ["git commit -m 'MY_GIT_CONFIG_COUNT and GIT_CONFIG_COUNTER are left unset'"],
    // review/233's twins: git's own option reading the global file, and a commit message naming a longer name.
    ["git config --global --get user.name"],
    ["git commit -m 'GIT_CONFIG_NOSYSTEM and GIT_CONFIG_GLOBALS are left unset'"],
    // Their twins (pr/3, pr/10, pr/11).
    ["npm -w x exec -- git status"],
    ["cmd /c g^it status"],
    ["wget --meth=GET https://api.github.com/repos/o/r/pulls/3"],
    ["wget --me=GET https://api.github.com/repos/o/r/pulls/3"],
    ["wget https://api.github.com/repos/o/r/releases"],
    ["wget -e method=GET https://api.github.com/repos/o/r/pulls/3"],
    ["wget -e robots=off https://api.github.com/repos/o/r/pulls/3"],
    // pr/56's twins: gh's default alias `co`, built-in groups, an alias listed or deleted, and gh with no group.
    ["gh co 3"],
    ["gh auth status"],
    ["gh run list"],
    ["gh alias list"],
    ["gh alias delete land"],
    ["gh --version"],
    // pr/67's: gh's own aliases of its built-ins (`gh <group> --help`, gh 2.102.0).
    ["gh ext list"],
    ["gh extensions list"],
    ["gh cs list"],
    ["gh at verify x.tgz -R o/r"],
    ["gh rs list"],
    ["gh agent-tasks list"],
    ["gh agent list"],
    ["gh agents list"],
    ["gh skills list"],
    // pr/51's and pr/57's twins: Corepack running a read, and the merge queue read.
    ["corepack pnpm exec git status"],
    ["gh api graphql -f query='query { repository(owner:\"o\",name:\"r\") { mergeQueue { entries { totalCount } } } }'"],
    // pr/72's and pr/77's twins: two reads in one curl call, wget's input file on a read, `symbolic-ref`'s read (pr/70).
    ["curl https://a.example --next https://b.example"],
    ["wget -i urls.txt"],
    ["git symbolic-ref --short -q HEAD"],
    // pr/81's twins: the same targets read.
    ["curl -s https://api.github.com/repos/o/r/pulls"],
    ["curl -o out.json https://api.github.com/repos/o/r/contents/x"],
    // pr/83's twins: a method the line shows, and round 4d's: the same pull request read.
    ["curl -X GET https://api.github.com/repos/o/r"],
    ["curl -X POST https://example.com/hook"],
    ["curl -oX https://api.github.com/repos/o/r/pulls/3"],
    ["gh api -i repos/o/r/pulls/3"],
    // pr/84's twin: the pull request read through a prefix of a no-value option.
    ["curl --sil https://api.github.com/repos/o/r/pulls/3"],
    // pr/93's twins: the same contents read through a dot segment, and a reply whose resolved path is a comments one.
    ["gh api repos/o/r/x/../contents/a.yml"],
    ["gh api -X POST repos/o/r/x/../issues/3/comments -F body=@reply.md"],
  ])("allows %j", (command) => {
    expect(unattendedPushVerdict(command)).toEqual({ deny: false });
  });
});

describe("CLAUDE_DENY_ROWS and CLAUDE_ASK_ROWS", () => {
  // TEST CHANGE (v0a2, REQ-FLOW-123, REQ-FLOW-124): Claude Code's settings now split the person-only rows. The deny list
  // holds the refused acts (deletions, force pushes, acts that cannot be undone) as `:*` prefix rows, then mid-pattern
  // rows for a refused flag that can follow an ask prefix, then the one refused MCP tool; the ask list holds the acts
  // that can be undone as `:*` prefix rows, then the MCP tools that ask. Each check below now reads both lists.
  /** A `Bash(<prefix>:*)` row: the prefix the shell guard's verdict reads. */
  const isPrefixRow = (row: string): boolean => /^Bash\([^()]+:\*\)$/.test(row);
  /** A mid-pattern row, `Bash(<prefix> * <flag>*)` with no `:*`: test/adapters/claude.test.ts pins these with a wildcard matcher. */
  const isMidPatternRow = (row: string): boolean => row.startsWith("Bash(") && !isPrefixRow(row);
  const DENY_PREFIX_ROWS = CLAUDE_DENY_ROWS.filter(isPrefixRow);
  const DENY_MID_ROWS = CLAUDE_DENY_ROWS.filter(isMidPatternRow);
  const ASK_PREFIX_ROWS = CLAUDE_ASK_ROWS.filter(isPrefixRow);
  /** The MCP tool rows no shell verdict sees (review/214). */
  const DENY_MCP_ROWS = CLAUDE_DENY_ROWS.filter((row) => !row.startsWith("Bash("));
  const ASK_MCP_ROWS = CLAUDE_ASK_ROWS.filter((row) => !row.startsWith("Bash("));
  const prefixOf = (row: string): string => row.slice("Bash(".length, -":*)".length);

  it("denies prefix rows, then mid-pattern rows, then the GitHub MCP server's repository deletion alone", () => {
    expect(DENY_PREFIX_ROWS.length).toBeGreaterThan(10);
    expect(DENY_MID_ROWS.length).toBeGreaterThan(0);
    for (const row of DENY_MID_ROWS) expect(row).toMatch(/^Bash\([^():]+\*\)$/);
    expect(new Set(CLAUDE_DENY_ROWS).size).toBe(CLAUDE_DENY_ROWS.length);
    expect(DENY_MCP_ROWS).toEqual(["mcp__github__delete_repository"]);
    expect(CLAUDE_DENY_ROWS).toEqual([...DENY_PREFIX_ROWS, ...DENY_MID_ROWS, ...DENY_MCP_ROWS]);
  });

  it("asks on prefix rows, then the GitHub MCP server's write tools by name", () => {
    expect(ASK_PREFIX_ROWS.length).toBeGreaterThan(10);
    expect(new Set(CLAUDE_ASK_ROWS).size).toBe(CLAUDE_ASK_ROWS.length);
    // Claude Code's MCP permission-rule form, `mcp__<server>__<tool>`: the server's merge and branch-write tools, one
    // row each, after every prefix row (review/214, the 03:12Z sign-off), then its review-submit, pull-request-update
    // and branch-create tools (review/226, the 04:01Z and 04:05Z sign-offs). Each asks; the repository deletion is
    // the deny list's.
    expect(ASK_MCP_ROWS).toEqual([
      "mcp__github__merge_pull_request",
      "mcp__github__push_files",
      "mcp__github__create_or_update_file",
      "mcp__github__delete_file",
      "mcp__github__update_pull_request_branch",
      "mcp__github__pull_request_review_write",
      "mcp__github__create_pull_request_review",
      "mcp__github__submit_pending_pull_request_review",
      "mcp__github__update_pull_request",
      "mcp__github__update_pull_request_state",
      "mcp__github__update_pull_request_draft_state",
      "mcp__github__create_branch",
      // pr/78: a pull request opened as a tool call skips the run verbs' draft and their title and body screen; the
      // row cannot read the mode, so it asks in every session, and the shell guard refuses it while a run is unattended.
      "mcp__github__create_pull_request",
    ]);
    expect(CLAUDE_ASK_ROWS).toEqual([...ASK_PREFIX_ROWS, ...ASK_MCP_ROWS]);
    // A row on both lists would be refused, never asked: the client reads a deny row first.
    for (const row of CLAUDE_ASK_ROWS) expect(CLAUDE_DENY_ROWS, row).not.toContain(row);
  });

  it("denies a tag force or deletion behind each ask-class `git tag` prefix with a mid-pattern row (review/73, review/74)", () => {
    const tagAsks = ASK_PREFIX_ROWS.filter((row) => row.startsWith("Bash(git tag "));
    expect(tagAsks).toHaveLength(5);
    for (const flag of ["-f", "--force", "-d", "--delete"]) {
      expect(DENY_MID_ROWS, flag).toContain(`Bash(git tag * ${flag}*)`);
      for (const row of tagAsks) {
        const line = `${prefixOf(row)} v1 -m x ${flag}`;
        expect(personOnlyVerdict(line, ON_FEATURE), line).toMatchObject({ deny: true, rule: "tag-delete", ask: false });
      }
    }
  });

  it("holds unarchiving beside archiving, since both change whether the repository takes writes (pr/96)", () => {
    const at = CLAUDE_ASK_ROWS.indexOf("Bash(gh repo archive:*)");
    expect(at).toBeGreaterThan(-1);
    expect(CLAUDE_ASK_ROWS[at + 1]).toBe("Bash(gh repo unarchive:*)");
  });

  it("names the GitHub MCP server by the key the engine writes it under", () => {
    // A row naming another server would match no tool the client surfaces: the key is the platform server's catalog id.
    expect(PLATFORM_MCP_SERVER.github).toBe("github");
    expect(CURATED_MCP_SERVERS.github?.id).toBe("github");
    for (const row of [...DENY_MCP_ROWS, ...ASK_MCP_ROWS]) expect(row.split("__")[1]).toBe(PLATFORM_MCP_SERVER.github);
  });

  it("holds only prefixes the shell guard also denies, each in its own list's class, so the two layers agree", () => {
    for (const row of DENY_PREFIX_ROWS) {
      expect(personOnlyVerdict(prefixOf(row), ON_FEATURE), row).toMatchObject({ deny: true, ask: false });
    }
    for (const row of ASK_PREFIX_ROWS) {
      expect(personOnlyVerdict(prefixOf(row), ON_FEATURE), row).toMatchObject({ deny: true, ask: true });
    }
  });

  it("reaches every rule a prefix can express", () => {
    const rules = new Set(
      [...DENY_PREFIX_ROWS, ...ASK_PREFIX_ROWS].map((row) => {
        const verdict = personOnlyVerdict(prefixOf(row), ON_FEATURE);
        return verdict.deny ? verdict.rule : "none";
      }),
    );
    // `push-default` has no row: a prefix ending in a branch name over-matches a longer one (see below).
    // `protection-delete` is a REST or GraphQL form only, which no prefix can say.
    // TEST CHANGE, justified (REQ-FLOW-140, REQ-FLOW-138, a4): no prefix row says the five new rules either: a status
    // write is a REST or GraphQL form, `--admin` and `--loosen` sit mid-line, a deploying branch is a name, and a
    // dispatch asks only where the repository names it, which a settings row cannot read.
    expect([...rules].toSorted()).toEqual(
      PERSON_ONLY_RULES.map((rule) => rule.id)
        // TEST CHANGE, justified (REQ-FLOW-121, review/103): `--approved` sits mid-line, which no prefix row can say.
        // TEST CHANGE, justified (review/117): a line's length is no prefix either.
        // TEST CHANGE, justified (REQ-FLOW-134, a4c): another repository's target and a mention sit mid-line, past
        // the command's prefix, and are read against the origin, which no settings row can know.
        // TEST CHANGE, justified (REQ-FLOW-134, review/129): a remote write runs on the main thread, so no row holds it.
        .filter((id) => !["push-default", "protection-delete", "status-write", "admin-merge", "push-deploying", "workflow-dispatch", "autonomy-loosen", "land-approved", "line-too-long", "outside-write", "remote-write"].includes(id))
        .toSorted(),
    );
  });

  it("holds no prefix row whose prefix, read as a raw string, also refuses or asks for an allowed command", () => {
    // If Claude Code's `:*` matched a raw string prefix rather than at a word boundary, `Bash(git push origin
    // main:*)` would refuse `git push origin main-feature` in an attended session; no row may prefix an allowed line.
    // The mid-pattern rows hold a `*` inside, which no raw prefix reads; test/adapters/claude.test.ts pins them.
    const allowed = [
      ...ALLOW.map(([command]) => command),
      "git push origin main-feature",
      "git push origin master-x",
      "git push origin HEAD:main-feature",
      "git push origin HEAD:refs/heads/master-x",
      "git push -u origin main-feature",
    ];
    for (const row of [...DENY_PREFIX_ROWS, ...ASK_PREFIX_ROWS]) {
      const prefix = prefixOf(row);
      for (const command of allowed) expect(command.startsWith(prefix), `${row} over ${command}`).toBe(false);
    }
  });
});

describe("the two shell-reading copies", () => {
  // Self-containment forces the helpers into both bodies; this keeps the copies
  // one text, so a fix to how one verdict reads a line cannot miss the other.
  it("are identical", () => {
    const source = readFileSync(fileURLToPath(new URL("../../src/hooks/personOnly.ts", import.meta.url)), "utf8");
    const blocks = [...source.matchAll(/\/\/ <shell-reading>\n([\s\S]*?)\/\/ <\/shell-reading>/g)].map((match) => match[1]);
    expect(blocks).toHaveLength(2);
    expect((blocks[0] ?? "").length).toBeGreaterThan(1000);
    expect(blocks[1]).toBe(blocks[0]);
  });
});

describe("embedding as source (u14 embeds both functions into the emitted guard)", () => {
  // `new Function` sees the global scope only: a reference to anything this
  // module imports or declares outside the function body throws here.
  const personOnly = new Function(`${personOnlyVerdict.toString()}\nreturn personOnlyVerdict;`)() as typeof personOnlyVerdict;
  const unattended = new Function(
    `${unattendedPushVerdict.toString()}\nreturn unattendedPushVerdict;`,
  )() as typeof unattendedPushVerdict;

  it("gives the same verdicts from the function's own source", () => {
    for (const [command, rule, ctx] of DENY) {
      expect(personOnly(command, ctx ?? ON_FEATURE)).toMatchObject({ deny: true, rule });
    }
    for (const [command, ctx] of ALLOW) expect(personOnly(command, ctx ?? ON_FEATURE)).toEqual({ deny: false });
    // TEST CHANGE (v0a): the embedded copy gives v0a's classes too.
    for (const [command, rule, ask, ctx] of CLASSES) expect(personOnly(command, ctx ?? ON_FEATURE)).toMatchObject({ rule, ask });
    expect(unattended("git push origin HEAD:refs/heads/x").deny).toBe(true);
    expect(unattended("gh api repos/o/r/pulls/3/comments -F body=@reply.md")).toEqual({ deny: false });
  });
});

/**
 * a4-guard-ask-list (REQ-FLOW-137, REQ-FLOW-138, REQ-FLOW-140, REQ-FLOW-121): what the autonomy setting runs, the new
 * rules' readers, the dry-run publish, the land verb's line and the deploying-branch matcher's copy. Each allowed row
 * sits beside a refused or asked one a fact away (a context field, a flag, a word), so a reading that ran everything,
 * or nothing, fails.
 */
describe("the autonomy setting's acts that run unasked (a4, REQ-FLOW-137)", () => {
  /** The context the guard bakes for the default setting: a ready mark, a local tag and an unnamed dispatch run. */
  const DEFAULT_RUNS: readonly PersonOnlyRuleId[] = ["pr-ready", "tag", "workflow-dispatch"];
  const RUNNING = { ...ON_FEATURE, runs: DEFAULT_RUNS, deployingBranches: [], stricterThanDefault: false };

  it.each([
    ["gh pr ready 3", ["pr-ready"]],
    ["git tag v2", ["tag"]],
    ["git tag -a v2 -m 'release v2'", ["tag"]],
    ["gh workflow run ci.yml", ["workflow-dispatch"]],
    ["gh api graphql -f query='mutation { markPullRequestReadyForReview(input: {pullRequestId: \"P\"}) { clientMutationId } }'", ["pr-ready"]],
    ["gh pr ready 3 && git tag v2", ["pr-ready", "tag"]],
  ])("runs %j under the default setting and names it, where no setting asks for it", (command, runs) => {
    expect(personOnlyVerdict(command, RUNNING)).toEqual({ deny: false, runs });
    // The neighbour: with no autonomy context (1.16.0's reading) the same act asks.
    expect(personOnlyVerdict(command, ON_FEATURE)).toMatchObject({ deny: true, ask: true });
  });

  it("never lets an act that runs hide an act that asks or refuses on the same line", () => {
    expect(personOnlyVerdict("git tag v2 && git push origin v2", { ...RUNNING, tags: ["v2"] })).toMatchObject({ deny: true, rule: "push-tags", ask: true });
    expect(personOnlyVerdict("gh pr ready 3 && gh pr merge 3", RUNNING)).toMatchObject({ deny: true, rule: "pr-merge", ask: true });
    expect(personOnlyVerdict("git tag v2 && git push --force origin feat/x", RUNNING)).toMatchObject({ deny: true, rule: "force-push", ask: false });
    expect(personOnlyVerdict("gh pr ready 3; git push origin --tags", RUNNING)).toMatchObject({ deny: true, rule: "push-tags", ask: true });
  });

  it("asks for an act the context leaves out of `runs`, as a repository naming it deploying leaves it out", () => {
    const named = { ...RUNNING, runs: ["tag", "workflow-dispatch"] as const };
    expect(personOnlyVerdict("gh pr ready 3", named)).toMatchObject({ deny: true, rule: "pr-ready", ask: true });
    expect(personOnlyVerdict("git tag v2", named)).toEqual({ deny: false, runs: ["tag"] });
    const dispatchNamed = { ...RUNNING, runs: ["pr-ready", "tag"] as const };
    expect(personOnlyVerdict("gh workflow run deploy.yml", dispatchNamed)).toMatchObject({ deny: true, rule: "workflow-dispatch", ask: true });
    expect(personOnlyVerdict("gh workflow list", dispatchNamed)).toEqual({ deny: false });
  });

  it("keeps a deletion or a forced move of a tag refuse-class whatever runs", () => {
    expect(personOnlyVerdict("git tag -d v1", RUNNING)).toMatchObject({ deny: true, rule: "tag-delete", ask: false });
    expect(personOnlyVerdict("git tag -f v1", RUNNING)).toMatchObject({ deny: true, rule: "tag-delete", ask: false });
  });
});

describe("a commit status or check run written (a4, REQ-FLOW-140)", () => {
  const RUNNING = { ...ON_FEATURE, runs: ["pr-ready", "tag", "workflow-dispatch"] as const };
  it("is refused whatever the setting runs, and its reads pass", () => {
    for (const ctx of [ON_FEATURE, RUNNING]) {
      expect(personOnlyVerdict("gh api -X POST repos/o/r/statuses/abc -f state=success", ctx)).toMatchObject({ deny: true, rule: "status-write", ask: false });
      expect(personOnlyVerdict("gh api repos/o/r/commits/abc/statuses", ctx)).toEqual({ deny: false });
      expect(personOnlyVerdict("gh api repos/o/r/commits/abc/check-runs", ctx)).toEqual({ deny: false });
    }
    const verdict = personOnlyVerdict("gh api -X POST repos/o/r/check-runs -f name=ci", ON_FEATURE);
    if (!verdict.deny) throw new Error("the check run write is no person-only act");
    expect(verdict.reason).toContain("is CI's to write, never the agent's (status-write)");
  });
});

describe("an admin merge (a4, REQ-FLOW-140)", () => {
  it("asks naming the admin route first, and a plain merge asks as a merge", () => {
    expect(personOnlyVerdict("gh pr merge 3 --squash --admin", ON_FEATURE)).toMatchObject({ deny: true, rule: "admin-merge", ask: true });
    expect(personOnlyVerdict("gh pr merge 3 --squash", ON_FEATURE)).toMatchObject({ deny: true, rule: "pr-merge", ask: true });
    expect(personOnlyVerdict("gh pr merge 3 --admin=false", ON_FEATURE)).toMatchObject({ deny: true, rule: "pr-merge", ask: true });
    // With a branch deletion beside it the refused act still decides.
    expect(personOnlyVerdict("gh pr merge 3 --admin -d", ON_FEATURE)).toMatchObject({ deny: true, rule: "push-delete", ask: false });
  });
});

describe("a push or write onto a deploying branch (a4, REQ-FLOW-140)", () => {
  const DEPLOYING = { defaultBranches: [], currentBranch: "feat/x", tags: [], deployingBranches: ["production", "release/*"] };
  const ON_PRODUCTION = { ...DEPLOYING, currentBranch: "production" };

  it.each([
    ["git push origin production"],
    ["git push origin HEAD:refs/heads/Production"],
    ["git push origin feat/x:release/1.17"],
    ["git push origin 'refs/heads/*:refs/heads/*'"],
    ["gh api -X PUT repos/o/r/contents/a.md -f message=m -f content=eA== -f branch=production"],
    ["gh api -X POST repos/o/r/merges -f base=release/2.0 -f head=feat/x"],
    ["gh api -X PATCH repos/o/r/git/refs/heads/production -f sha=abc"],
    ["gh api graphql -f query='mutation { createCommitOnBranch(input: {branch: {branchName: \"production\"}}) { commit { oid } } }'"],
    ["gh repo sync o/r -b production"],
  ])("asks for %j as push-deploying", (command) => {
    expect(personOnlyVerdict(command, DEPLOYING)).toMatchObject({ deny: true, rule: "push-deploying", ask: true });
    // The neighbour: the same line in a repository naming no deploying branch.
    const plain = personOnlyVerdict(command, { ...DEPLOYING, deployingBranches: [] });
    expect(plain.deny ? plain.rule : null, command).not.toBe("push-deploying");
  });

  it("reads the branch the session is on for a push that names none, or `HEAD`", () => {
    expect(personOnlyVerdict("git push", ON_PRODUCTION)).toMatchObject({ deny: true, rule: "push-deploying" });
    expect(personOnlyVerdict("git push origin HEAD", ON_PRODUCTION)).toMatchObject({ deny: true, rule: "push-deploying" });
    expect(personOnlyVerdict("git push", DEPLOYING)).toEqual({ deny: false });
    expect(personOnlyVerdict("git push origin HEAD", DEPLOYING)).toEqual({ deny: false });
  });

  it("allows a feature branch and a branch the pattern's one segment does not reach", () => {
    for (const command of ["git push origin feat/x", "git push origin release/1.17/hotfix", "git push origin production-eu"]) {
      expect(personOnlyVerdict(command, DEPLOYING), command).toEqual({ deny: false });
    }
  });

  it("names the deploying push before the default-branch push when the default branch is listed too", () => {
    const mainListed = { ...DEPLOYING, deployingBranches: ["main"] };
    expect(personOnlyVerdict("git push origin main", mainListed)).toMatchObject({ deny: true, rule: "push-deploying", ask: true });
  });
});

/**
 * The shared table of branch names and patterns (review/20): `src/config/autonomy.ts`'s matcher and the guard's copy
 * inside `personOnlyVerdict` read every row, the copy through a push of that name.
 */
const DEPLOYING_TABLE: readonly (readonly [name: string, patterns: readonly string[], matches: boolean])[] = [
  ["release/1.17", ["release/*"], true],
  ["release/1.17/hotfix", ["release/*"], false],
  ["release/1.17/hotfix", ["release/**"], true],
  ["releases/1.17", ["release/**"], false],
  ["production", ["production"], true],
  ["Production", ["production"], true],
  ["production-eu", ["production"], false],
  ["prod", ["production"], false],
  ["feature/a/b", ["feature/*/b"], true],
  ["feature/a/c/b", ["feature/*/b"], false],
  ["deploy/x", ["refs/heads/deploy/*"], true],
  ["x", ["*"], true],
  ["a/b", ["*"], false],
  ["a/b", ["**"], true],
  ["hotfix", ["release/*", "hotfix"], true],
  ["staging", [], false],
];

describe("the deploying-branch matcher's copy (a4, review/20)", () => {
  it.each(DEPLOYING_TABLE.map(([name, patterns, matches]) => ({ name, patterns, matches })))(
    "reads $name against $patterns as $matches in both copies",
    ({ name, patterns, matches }) => {
      expect(matchesDeployingBranch(name, patterns)).toBe(matches);
      const verdict = personOnlyVerdict(`git push origin HEAD:refs/heads/${name}`, { ...ON_FEATURE, deployingBranches: patterns });
      expect(verdict.deny ? verdict.rule : null).toBe(matches ? "push-deploying" : null);
    },
  );

  it("is the kernel module's code, word for word", () => {
    const read = (path: string): string => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
    /** A function's text from its signature to the closing brace at its own indent, the indent taken off. */
    const body = (text: string, signature: string, indent: string): string => {
      const start = text.indexOf(`${indent}${signature}`);
      const end = text.indexOf(`\n${indent}}\n`, start);
      expect(start, signature).toBeGreaterThan(-1);
      return text
        .slice(start, end + indent.length + 2)
        .split("\n")
        .map((line) => (line.startsWith(indent) ? line.slice(indent.length) : line))
        .join("\n");
    };
    const kernel = read("../../src/config/autonomy.ts");
    const guard = read("../../src/hooks/personOnly.ts");
    const copy = /\/\/ <deploying-branch>\n([\s\S]*?)\/\/ <\/deploying-branch>/.exec(guard)?.[1] ?? "";
    for (const signature of ["function branchKey(name: string): string {", "function matchesDeployingBranch(name: string, patterns: readonly string[]): boolean {"]) {
      const original = body(kernel, signature.startsWith("function matches") ? `export ${signature}` : signature, "").replace(/^export /, "");
      expect(body(copy, signature, "  "), signature).toBe(original);
    }
  });
});

describe("loosening the autonomy setting (a4, REQ-FLOW-138)", () => {
  const STRICT = { ...ON_FEATURE, stricterThanDefault: true };
  const DEFAULT = { ...ON_FEATURE, stricterThanDefault: false };

  it.each([
    ["stamity sync --loosen"],
    ["npx -y @zomarit/stamity@1.16.0 sync --loosen"],
    ["npx --no stamity init -y --loosen"],
    ["st workspace sync --loosen"],
    ["node dist/cli.js add production --loosen"],
    ["node ./node_modules/@zomarit/stamity/dist/cli.js sync --loosen=true"],
    ["npm exec -- stamity sync --loosen"],
    ["$STAMITY sync --loosen"],
    ["stamity sync \"$FLAG\""],
    ["stamity sync `printf -- --loosen`"],
    ["echo ok && stamity sync --loosen"],
  ])("asks for %j in either setting", (command) => {
    for (const ctx of [STRICT, DEFAULT]) expect(personOnlyVerdict(command, ctx), command).toMatchObject({ deny: true, rule: "autonomy-loosen", ask: true });
  });

  it.each([
    ["stamity sync"],
    ["npx -y @zomarit/stamity@1.16.0 sync --dry-run"],
    ["git commit -m 'stamity sync --loosen'"],
    ["echo --loosen"],
    ["rg -n -- --loosen src"],
    ["stamity clean --pack production"],
    ["stamity init -y"],
  ])("allows %j, a word that only names the flag or a command that lands no looser guard", (command) => {
    for (const ctx of [STRICT, DEFAULT]) expect(personOnlyVerdict(command, ctx), command).toEqual({ deny: false });
  });

  it("asks for a full clean or an init --force only while the baked setting is stricter than the default", () => {
    for (const command of ["stamity clean", "npx --no stamity clean --yes", "stamity init --force -y"]) {
      expect(personOnlyVerdict(command, STRICT), command).toMatchObject({ deny: true, rule: "autonomy-loosen", ask: true });
      expect(personOnlyVerdict(command, DEFAULT), command).toEqual({ deny: false });
    }
    // With no autonomy context the reading cannot tell, so it asks.
    expect(personOnlyVerdict("stamity clean", ON_FEATURE)).toMatchObject({ deny: true, rule: "autonomy-loosen" });
  });
});

describe("a dry-run publish (a4, REQ-FLOW-102 as built)", () => {
  it.each([
    ["npm publish --dry-run"],
    ["npm publish ./pkg.tgz --dry-run --tag next"],
    ["npm publish --dry-run=true"],
    ["pnpm publish --dry-run --no-git-checks"],
    ["bun publish --dry-run"],
    ["yarn npm publish --dry-run"],
  ])("runs %j, which sends nothing", (command) => {
    expect(personOnlyVerdict(command, ON_FEATURE)).toEqual({ deny: false });
  });

  it.each([
    ["npm publish"],
    ["npm publish --dry-run=false"],
    ["npm publish --dry-run --no-dry-run"],
    ["npm publish --dry-run --dry"],
    ["npm publish \"--dry-run\""],
    ["npm publish '--dry-run'"],
    ["npm publish $DRY"],
    ["npm publish --dry-run$X"],
    ["npm_config_dry_run=false npm publish --dry-run"],
    ["npm publish -- --dry-run"],
    ["npm publish --tag --dry-run"],
    ["yarn publish --dry-run"],
  ])("asks for %j, a spelling the guard cannot read as a dry run", (command) => {
    expect(personOnlyVerdict(command, ON_FEATURE)).toMatchObject({ deny: true, rule: "publish", ask: true });
  });
});

describe("the land verb's line (a4, REQ-FLOW-121)", () => {
  /** The attended reading: the parsed program words only. */
  const attended = (command: string): ReturnType<typeof unattendedPushVerdict> => unattendedPushVerdict(command, false, true);

  it.each([
    ["stamity run land --run 2026-10-23_x --ready --json"],
    ["npx --no stamity run land --run 2026-10-23_x --ready --wait 8 --json"],
    ["st run land --run 2026-10-23_x --fast-forward"],
  ])("passes %j alone on its line in both modes", (command) => {
    expect(attended(command)).toEqual({ deny: false });
    expect(unattendedPushVerdict(command)).toEqual({ deny: false });
  });

  it.each([
    ["npm test && stamity run land --run x"],
    ["stamity run land --run x; git status"],
    ["GIT_TRACE=1 stamity run land --run x"],
    ["env -u GIT_EXEC_PATH stamity run land --run x"],
    ["node dist/cli.js run land --run x"],
    ["stamity run land --run x > out.txt"],
  ])("refuses %j, the verb beside more than itself, in both modes", (command) => {
    const verdict = attended(command);
    expect(verdict.deny).toBe(true);
    if (verdict.deny) expect(verdict.reason).toContain("`stamity run land` on a line that is more than the verb");
    expect(unattendedPushVerdict(command).deny).toBe(true);
  });

  it("lets a commit message, a comment or a search that names the verb run attended, and refuses it unattended", () => {
    for (const command of ["git commit -m 'docs: stamity run land --run x lands the run'", "rg 'stamity run land' docs && git status"]) {
      expect(attended(command), command).toEqual({ deny: false });
      expect(unattendedPushVerdict(command).deny, command).toBe(true);
    }
  });

  it("leaves every other verb's line to the unattended rule alone", () => {
    expect(attended("npm test && stamity run checkpoint --run x")).toEqual({ deny: false });
    expect(unattendedPushVerdict("npm test && stamity run checkpoint --run x").deny).toBe(true);
  });

  it("names a PowerShell splat in a word after `run` (build/97)", () => {
    const verdict = unattendedPushVerdict("stamity run land --run x @opts", true);
    expect(verdict.deny).toBe(true);
    if (verdict.deny) expect(verdict.reason).toContain("an unquoted `@` in a word after `run`, which PowerShell reads as a splat");
  });
});

/**
 * a4 fixer round 1 (review/37, review/38, review/42, review/44, review/45, review/39): the readings the round's
 * findings named. Each row's input sits in the table; the titles name the class of input. A row marked "red on the
 * head" failed on e2a2f2c6 for the reason its comment gives.
 */
describe("a dry-run flag's separate value word (a4, review/42)", () => {
  // Red on the head: the literal flag passed whatever word followed it, and npm's parser takes `false` as its value.
  it.each([
    ["npm, a separate false", "npm publish --dry-run false"],
    ["pnpm, a separate false", "pnpm publish --dry-run false"],
    ["bun, a separate false", "bun publish --dry-run false"],
    ["yarn's npm publish, a separate false", "yarn npm publish --dry-run false"],
    ["a single-quoted false", "npm publish --dry-run 'false'"],
    ["a double-quoted false", "npm publish --dry-run \"false\""],
    ["another letter case", "npm publish --dry-run FALSE"],
    ["another boolean word", "npm publish --dry-run no"],
    ["a numeric boolean", "npm publish --dry-run 0"],
    ["a later flag with a false", "npm publish --dry-run --dry-run false"],
    ["a glob that may name false", "npm publish --dry-run fals?"],
    ["a brace expansion that may give false", "npm publish --dry-run f{al,}se"],
  ])("reads a publish for %s after the flag", (_, command) => {
    expect(personOnlyVerdict(command, ON_FEATURE), command).toMatchObject({ deny: true, rule: "publish", ask: true });
  });

  it.each([
    ["a separate true", "npm publish --dry-run true"],
    ["a package path", "npm publish --dry-run ./pkg.tgz"],
    ["another option", "pnpm publish --dry-run --no-git-checks"],
    ["the flag last", "bun publish ./dir --dry-run"],
    ["a quoted package path", "npm publish --dry-run './my pkg.tgz'"],
  ])("runs a dry run for %s after the flag", (_, command) => {
    expect(personOnlyVerdict(command, ON_FEATURE), command).toEqual({ deny: false });
  });
});

describe("the package test's program words (a4, review/44)", () => {
  const STRICT = { ...ON_FEATURE, stricterThanDefault: true };
  const FORK = { ...ON_FEATURE, stricterThanDefault: false, packageWords: ["stamity", "st", "forge", "forge-cli"] };

  it.each([
    // Red on the head: a package manager given the second bin as its first word, and the source entry file.
    ["yarn running the second bin", "yarn st sync --loosen"],
    ["pnpm running the second bin", "pnpm st sync --loosen"],
    ["bun running the second bin", "bun st sync --loosen"],
    ["a manager's run of the second bin", "pnpm run st sync --loosen"],
    ["a manager's option before the second bin", "yarn --cwd app st sync --loosen"],
    ["node on the source entry file", "node src/cli.ts sync --loosen"],
    ["tsx on the source entry file", "tsx src/cli.ts sync --loosen"],
    ["a runner of tsx on the source entry file", "npx tsx ./src/cli.ts sync --loosen"],
    // Read on the head too, kept beside the rows above: a runner's exec and dlx unwrap to the bin.
    ["yarn exec of the second bin", "yarn exec st sync --loosen"],
    ["pnpm exec of the second bin", "pnpm exec st sync --loosen"],
    ["pnpm dlx of the second bin", "pnpm dlx st sync --loosen"],
    ["bun x of the second bin", "bun x st sync --loosen"],
  ])("asks for a loosening through %s", (_, command) => {
    expect(personOnlyVerdict(command, STRICT), command).toMatchObject({ deny: true, rule: "autonomy-loosen", ask: true });
  });

  it.each([
    ["the fork's bin", "forge-cli sync --loosen"],
    ["the fork's unscoped name", "forge sync --loosen"],
    ["the fork's bin by its path", "node node_modules/.bin/forge-cli sync --loosen"],
    ["the fork's bin under yarn", "yarn forge-cli sync --loosen"],
    ["the fork's bin under a runner", "npx --no forge-cli sync --loosen"],
  ])("asks for a loosening through %s where the guard bakes the fork's words", (_, command) => {
    expect(personOnlyVerdict(command, FORK), command).toMatchObject({ deny: true, rule: "autonomy-loosen", ask: true });
    // The neighbour: a guard baking only the canonical words reads another program.
    expect(personOnlyVerdict(command, { ...ON_FEATURE, stricterThanDefault: false }), command).toEqual({ deny: false });
  });

  it.each([
    ["a manager installing a package named like the bin", "npm install st"],
    ["a manager's script beside a word like the bin", "npm test -- --grep st \"$PATTERN\""],
    ["node on another file", "node scripts/x.mjs --loosen"],
  ])("leaves %s to its own program", (_, command) => {
    expect(personOnlyVerdict(command, STRICT), command).toEqual({ deny: false });
  });

  it("reads the land line through the same words, attended, and admits a fork's bin alone on its line", () => {
    // TEST CHANGE, justified (REQ-FLOW-138, review/53): the verdict takes the baked identity as one object, its
    // package words, name and own-repository flag, since the CLI file is now read by its path.
    const attended = (command: string): ReturnType<typeof unattendedPushVerdict> =>
      unattendedPushVerdict(command, false, true, { words: FORK.packageWords });
    expect(attended("forge-cli run land --run 2026-10-23_x --ready")).toEqual({ deny: false });
    for (const command of ["npm test && forge-cli run land --run x", "yarn st run land --run x", "tsx src/cli.ts run land --run x"]) {
      expect(attended(command).deny, command).toBe(true);
    }
    // The neighbours on the head's words: a fork's bin is another program there, and `npx st` names another package.
    expect(unattendedPushVerdict("npm test && forge-cli run land --run x", false, true)).toEqual({ deny: false });
    expect(unattendedPushVerdict("npx --no st run land --run x", false, true).deny).toBe(true);
  });
});

describe("a stamity command's words the shell still expands (a4, review/37, review/45)", () => {
  const STRICT = { ...ON_FEATURE, stricterThanDefault: true };
  const DEFAULT = { ...ON_FEATURE, stricterThanDefault: false };

  // Red on the head (review/37): single-quoted text was read as an expansion.
  it.each([
    ["a single-quoted backtick in a run title", "stamity run end --run 2026-10-23_x --title 'fix `x` reader'"],
    ["a single-quoted dollar in a summary", "stamity learn capture --summary 'a $5 read in src/a.ts' --confidence high"],
    ["a single-quoted substitution's text", "st learn capture --summary 'reads $(git rev-parse HEAD) first'"],
    ["an escaped dollar", "stamity run end --run x --title cost\\$5"],
    ["an ANSI-C-quoted dollar", "stamity run end --run x --title $'a $b'"],
    ["a single-quoted glob and brace", "stamity learn capture --summary 'globs like *.ts and {a,b}'"],
  ])("runs %s, which is literal text", (_, command) => {
    for (const ctx of [STRICT, DEFAULT]) expect(personOnlyVerdict(command, ctx), command).toEqual({ deny: false });
  });

  it.each([
    ["a double-quoted variable", "stamity run end --run x --title \"fix $X\""],
    ["a double-quoted backtick", "stamity run end --run x --title \"fix `x`\""],
    ["a double-quoted substitution", "stamity learn capture --summary \"$(cat note)\""],
    ["an unquoted variable", "stamity sync $FLAG"],
    ["a braced variable", "stamity sync ${FLAG:-}"],
    // Red on the head (review/45): a glob, a brace expansion, and arguments xargs adds.
    ["an unquoted glob", "stamity sync --loo*"],
    ["an unquoted bracket glob", "stamity sync --[l]oosen"],
    ["an unquoted brace expansion", "stamity sync {--loosen,}"],
    ["a run under xargs", "echo --loosen | xargs stamity sync"],
    ["a run under xargs with a placeholder", "echo --loosen | xargs -I % stamity sync %"],
    ["a run under xargs through a runner", "echo --loosen | xargs npx --no stamity sync"],
    ["a PowerShell splat", "pwsh -Command 'stamity sync @opts'"],
  ])("asks for %s, which may spell `--loosen`", (_, command) => {
    for (const ctx of [STRICT, DEFAULT]) {
      expect(personOnlyVerdict(command, ctx), command).toMatchObject({ deny: true, rule: "autonomy-loosen", ask: true });
    }
  });

  it("names xargs in the act it asks for, and leaves xargs over another program alone", () => {
    const verdict = personOnlyVerdict("echo x | xargs stamity sync", DEFAULT);
    expect(verdict).toMatchObject({ deny: true, act: expect.stringContaining("run under `xargs`") });
    expect(personOnlyVerdict("ls | xargs echo", DEFAULT)).toEqual({ deny: false });
    expect(personOnlyVerdict("stamity sync {a}", DEFAULT)).toEqual({ deny: false });
    // A POSIX shell reads an `@` as a plain character.
    expect(personOnlyVerdict("stamity sync @opts", DEFAULT)).toEqual({ deny: false });
  });
});

describe("a program word the reading cannot settle (a4, review/38, the declared default)", () => {
  const STRICT = { ...ON_FEATURE, stricterThanDefault: true };
  const DEFAULT = { ...ON_FEATURE, stricterThanDefault: false };

  it.each([
    ["a variable directory with a literal file name", "\"$ROOT/node_modules/.bin/vitest\" run \"$FILE\""],
    ["a substitution directory with a literal file name", "\"$(git rev-parse --show-toplevel)/scripts/x.sh\" \"$arg\""],
    ["a glob directory with a literal file name", "/opt/*/bin/vitest run \"$F\""],
    ["a glob file name that cannot name the package", "./? \"$X\""],
  ])("runs %s, settled by its last path part", (_, command) => {
    for (const ctx of [STRICT, DEFAULT]) expect(personOnlyVerdict(command, ctx), command).toEqual({ deny: false });
  });

  it.each([
    ["a variable directory with a literal stamity file name", "\"$ROOT/node_modules/.bin/stamity\" sync \"$ARG\""],
    ["a variable directory with the second bin", "\"$HOME/.bin/st\" sync --loosen"],
    ["a glob directory with a literal stamity file name", "/opt/*/bin/stamity sync --loosen"],
  ])("gives %s the loosen check", (_, command) => {
    expect(personOnlyVerdict(command, DEFAULT), command).toMatchObject({ deny: true, rule: "autonomy-loosen", act: expect.stringMatching(/^(?:A stamity command|Loosening)/) });
    // A literal argument there passes, as it does on the bare program.
    const plain = command.replace(/ (?:"\$ARG"|--loosen)$/, "");
    expect(personOnlyVerdict(plain, DEFAULT), plain).toEqual({ deny: false });
  });

  it.each([
    ["a wholly variable program with a variable argument", "\"$BIN\" \"$ARG\""],
    ["a program whose last part is a variable", "/usr/local/bin/$TOOL sync \"$F\""],
    ["a braced pattern substitution", "${X/a/b} \"$F\""],
    ["a glob file name that may name the package", "/usr/bin/s? \"$F\""],
    ["a glob file name with a Windows suffix that may name the package", "./stamit?.exe \"$F\""],
  ])("asks for %s, naming a command the guard cannot read", (_, command) => {
    for (const ctx of [STRICT, DEFAULT]) {
      expect(personOnlyVerdict(command, ctx), command).toMatchObject({
        deny: true,
        rule: "autonomy-loosen",
        ask: true,
        act: "A command the guard cannot read, which may be a stamity command, with an argument the guard cannot read, which may spell `--loosen`",
      });
    }
  });
});

describe("the deploying-branch readers (a4, review/39)", () => {
  const DEPLOYING = { defaultBranches: [], currentBranch: "feat/x", tags: [], deployingBranches: ["production", "release/*"] };
  const OID = "a".repeat(40);

  it.each([
    ["a matching push", "git push origin :"],
    ["a refspec-less push under a matching push.default", "git -c push.default=matching push origin"],
    ["a send-pack with no ref", "git send-pack origin"],
    ["a symbolic ref", "git symbolic-ref refs/heads/x refs/heads/production"],
    ["an update-ref symref command", "printf 'symref-update refs/heads/x refs/heads/release/2.0\\n' | git update-ref --stdin"],
    ["a GraphQL mergeBranch", "gh api graphql -f query='mutation { mergeBranch(input: {repositoryId: \"R\", base: \"production\", head: \"feat/x\"}) { clientMutationId } }'"],
    ["a GraphQL updateRef", `gh api graphql -f query='mutation { updateRef(input: {refId: "R", oid: "${OID}"}) { clientMutationId } }'`],
    ["a GraphQL updateRefs entry", updateRefs("refs/heads/production", OID)],
    ["a GraphQL createRef", `gh api graphql -f query='mutation { createRef(input: {repositoryId: "R", name: "refs/heads/release/3.0", oid: "${OID}"}) { ref { id } } }'`],
    ["a REST merge-upstream", "gh api -X POST repos/o/r/merge-upstream -f branch=production"],
    ["a symbolic ref to a target the line cannot show", "git symbolic-ref refs/heads/x \"$TARGET\""],
    ["a sync of a branch the line cannot show", "gh repo sync o/r -b \"$(cat branch)\""],
  ])("asks for %s as push-deploying", (_, command) => {
    expect(personOnlyVerdict(command, DEPLOYING), command).toMatchObject({ deny: true, rule: "push-deploying", ask: true });
    // The neighbour: the same line in a repository naming no deploying branch.
    const plain = personOnlyVerdict(command, { ...DEPLOYING, deployingBranches: [] });
    expect(plain.deny ? plain.rule : null, command).not.toBe("push-deploying");
  });

  it.each([
    ["a symbolic ref", "git symbolic-ref refs/heads/x refs/heads/feat/y"],
    ["a GraphQL mergeBranch", "gh api graphql -f query='mutation { mergeBranch(input: {repositoryId: \"R\", base: \"feat/y\", head: \"feat/x\"}) { clientMutationId } }'"],
    ["a GraphQL createRef", `gh api graphql -f query='mutation { createRef(input: {repositoryId: "R", name: "refs/heads/feat/y", oid: "${OID}"}) { ref { id } } }'`],
    ["a REST merge-upstream", "gh api -X POST repos/o/r/merge-upstream -f branch=feat/y"],
  ])("leaves %s onto a branch no pattern names alone", (_, command) => {
    const verdict = personOnlyVerdict(command, DEPLOYING);
    expect(verdict.deny ? verdict.rule : null, command).not.toBe("push-deploying");
  });
});

/**
 * a4 fixer round 2 (review/45, review/52, review/53, review/54, review/55): a mark, once set, is never lost; a glob reads
 * as unreadable only where it can give a dash word; the CLI file is read by its path. Titles name the class of input;
 * each input sits in its table. Each row marked "red" failed on 4adef43c for the reason its title names.
 */
describe("a mark carried into every nested reading (a4, review/54, review/45, review/55)", () => {
  const STRICT = { ...ON_FEATURE, stricterThanDefault: true };
  const DEFAULT = { ...ON_FEATURE, stricterThanDefault: false };

  // Red: each nesting the reader knows, its value filled in by the shell around it and single-quoted inside.
  it.each([
    ["a shell's command string", "sh -c \"stamity sync '$F'\""],
    ["a login shell's command string", "bash -lc \"stamity sync '$F'\""],
    ["an eval", "eval \"stamity sync '$F'\""],
    ["env's split string", "env -S \"stamity sync '$F'\""],
    ["a runner's command option", "npx -c \"stamity sync '$F'\""],
    ["a package manager's exec command option", "npm exec -c \"stamity sync '$F'\""],
    ["PowerShell's command string", "pwsh -Command \"stamity sync '$F'\""],
    ["the Windows command interpreter's string", "cmd /c \"stamity sync '$F'\""],
    ["a rebase exec line", "git rebase --exec \"stamity sync '$F'\" main"],
    ["a bisect run command", "git bisect run sh -c \"stamity sync '$F'\""],
    ["a program word holding a line", "bun exec \"stamity sync '$F'\""],
    ["an escaped dollar a nested eval expands", "eval \"eval \\\"stamity sync '\\$F'\\\"\""],
    ["xargs filling a token inside a shell's string", "echo --loosen | xargs -I{} sh -c 'stamity sync {}'"],
    ["xargs filling a token inside env's split string", "echo --loosen | xargs -I% env -S 'stamity sync %'"],
    ["the interpreter's percent variable", "cmd /c stamity sync %F%"],
    ["the interpreter's delayed variable", "cmd /c \"stamity sync !F!\""],
  ])("asks for %s, whose filled-in value may spell `--loosen`", (_, command) => {
    for (const ctx of [STRICT, DEFAULT]) {
      expect(personOnlyVerdict(command, ctx), command).toMatchObject({ deny: true, rule: "autonomy-loosen", ask: true });
    }
  });

  it.each([
    ["a shell's single-quoted string", "sh -c 'stamity sync --json'"],
    ["an eval of literal words", "eval 'stamity sync'"],
    ["env's literal split string", "env -S 'stamity sync'"],
    ["the interpreter's literal string", "cmd /c stamity sync"],
    ["a shell's string holding a single-quoted dollar", "sh -c 'stamity run end --run x --title '\\''cost $5'\\'''"],
    ["a shell's double-quoted string with no expansion", "bash -c \"npm test && stamity sync\""],
  ])("runs %s, whose words the reading sees", (_, command) => {
    expect(personOnlyVerdict(command, DEFAULT), command).toEqual({ deny: false });
  });

  it("asks for any command a nested string holds after an outer expansion, since the value may add commands", () => {
    // The outer shell puts the value in the text before the inner shell parses it, so a separator in it adds commands.
    expect(personOnlyVerdict("bash -c \"cd $DIR && npm test\"", DEFAULT)).toMatchObject({ deny: true, rule: "autonomy-loosen", ask: true });
    expect(personOnlyVerdict("bash -c 'cd $DIR && npm test'", DEFAULT)).toEqual({ deny: false });
  });
});

describe("a program word built by an expansion (a4, review/45)", () => {
  const DEFAULT = { ...ON_FEATURE, stricterThanDefault: false };

  // Red: the program word itself carried the words.
  it.each([
    ["a brace-expanded program word", "{stamity,sync,--loosen}"],
    ["a brace-expanded program word with a literal argument", "{stamity,sync} --json"],
    ["an unquoted variable program with literal arguments", "$CMD sync --json"],
    ["an unquoted variable program alone", "$CMD"],
    ["a quoted variable program a runner reads as a line", "bun exec \"$CMD\""],
    ["a glob program word that may give a dash word", "* sync"],
  ])("asks for %s, which carries words the line does not show", (_, command) => {
    expect(personOnlyVerdict(command, DEFAULT), command).toMatchObject({
      deny: true,
      rule: "autonomy-loosen",
      act: "A command the guard cannot read, which may be a stamity command, with an argument the guard cannot read, which may spell `--loosen`",
    });
  });

  it.each([
    ["a literal program", "./node_modules/.bin/vitest run"],
    ["a glob program word with a literal prefix and literal arguments", "/usr/bin/sta* --version"],
    ["a quoted variable directory with a literal file name", "\"$ROOT/bin/vitest\" run"],
  ])("runs %s", (_, command) => {
    expect(personOnlyVerdict(command, DEFAULT), command).toEqual({ deny: false });
  });
});

describe("a glob or brace argument that cannot spell an option (a4, review/52)", () => {
  const STRICT = { ...ON_FEATURE, stricterThanDefault: true };

  // Red: the head read every glob as unreadable.
  it.each([
    ["a checkpoint's path glob", "npx --no stamity run checkpoint --run 2026-10-23_x --paths src/hooks/*.ts --json"],
    ["a run end's path glob", "stamity run end --run 2026-10-23_x --paths docs/*.md test/hooks/*.test.ts"],
    ["the ready check's plan glob", "stamity plan check docs/plans/022-*.md --json"],
    ["a brace form after a literal folder", "stamity run checkpoint --run x --paths src/{a,b}.ts"],
    ["a bracket glob after a literal prefix", "stamity plan check docs/plans/02[12]-x.md"],
  ])("runs %s, whose literal text before the glob opens with no dash", (_, command) => {
    expect(personOnlyVerdict(command, STRICT), command).toEqual({ deny: false });
  });

  it.each([
    ["a glob with no literal prefix", "stamity sync *"],
    ["a one-character glob with no literal prefix", "stamity sync ?-loosen"],
    ["a glob after a dash", "stamity sync -*"],
    ["a brace alternative opening with a dash", "stamity sync {x,--loosen}"],
    ["a brace form with no literal prefix", "stamity sync {a,b}"],
  ])("asks for %s, which may give a dash word", (_, command) => {
    expect(personOnlyVerdict(command, STRICT), command).toMatchObject({ deny: true, rule: "autonomy-loosen", ask: true });
  });

  it("keeps the dry-run reading on any glob after the flag, which may give a false word", () => {
    expect(personOnlyVerdict("npm publish --dry-run fals?", ON_FEATURE)).toMatchObject({ deny: true, rule: "publish" });
  });
});

describe("the engine's CLI file read by its path (a4, review/53, the declared default)", () => {
  /** A consumer repository: its package.json names another package. */
  const CONSUMER = { ...ON_FEATURE, stricterThanDefault: true, ownRepository: false };
  /** The engine's own repository. */
  const OWN = { ...ON_FEATURE, stricterThanDefault: true, ownRepository: true };

  // Red: any file named like the CLI read as the engine's.
  it.each([
    ["a consumer's built CLI with an expanded argument", "node dist/cli.js build \"$OUT\""],
    ["a consumer's source CLI with a glob argument", "tsx src/cli.ts test/*.json --out *"],
    ["a consumer's built CLI's full clean", "node dist/cli.js clean"],
    ["a consumer's source CLI's init with force", "tsx src/cli.ts init --force"],
  ])("runs %s, which only shares the CLI's file name", (_, command) => {
    expect(personOnlyVerdict(command, CONSUMER), command).toEqual({ deny: false });
  });

  it.each([
    ["a consumer's built CLI", "node dist/cli.js sync --loosen"],
    ["a consumer's source CLI", "tsx ./src/cli.ts sync --loosen=true"],
  ])("asks for %s given the literal loosen flag", (_, command) => {
    expect(personOnlyVerdict(command, CONSUMER), command).toMatchObject({ deny: true, rule: "autonomy-loosen", ask: true });
  });

  it.each([
    ["the installed package's CLI file", "node node_modules/@zomarit/stamity/dist/cli.js sync \"$X\"", CONSUMER],
    ["a pnpm store path to the package", "node node_modules/.pnpm/@zomarit+stamity@1.16.0/node_modules/@zomarit/stamity/dist/cli.js clean", CONSUMER],
    ["the bin link", "node ./node_modules/.bin/st sync \"$X\"", CONSUMER],
    ["a renamed fork's installed CLI file", "node node_modules/@acme/forge/dist/cli.js clean", { ...CONSUMER, packageName: "@acme/forge" }],
    ["the engine's own built CLI in its repository", "node dist/cli.js sync \"$X\"", OWN],
    ["the engine's own source CLI in its repository", "tsx src/cli.ts clean", OWN],
  ])("gives %s the full check", (_, command, ctx) => {
    expect(personOnlyVerdict(command, ctx), command).toMatchObject({ deny: true, rule: "autonomy-loosen", ask: true });
  });
});

describe("a push refspec read from its word's marks (a4, build/4, review/69, review/77)", () => {
  const TAGGED_FEATURE = { defaultBranches: ["trunk"], currentBranch: "feat/x", tags: ["v1.0.0"] };
  const DEPLOYING = { ...TAGGED_FEATURE, deployingBranches: ["production", "release/*"] };

  // build/4: characters that only look like an expansion, single-quoted, are the name.
  // TEST CHANGE, justified (build/12): a substitution nothing closes on the line now leaves the rest of the line unread,
  // filled in, so the run verb's push of a branch name nesting unclosed substitution characters asks as a push to the
  // default branch (the list below) instead of running.
  it.each([
    ["a single-quoted branch name holding a dollar", "git push origin 'feat/a$b'"],
    ["a single-quoted branch name holding a group", "git push origin 'HEAD:refs/heads/feat(x)'"],
  ])("runs %s", (_, command) => {
    expect(personOnlyVerdict(command, TAGGED_FEATURE), command).toEqual({ deny: false });
  });

  // TEST CHANGE, justified (REQ-FLOW-140, review/77): round 2 ran the two unquoted rows on their literal prefix, but the
  // expansion may supply the colon and a default destination, so a word the shell fills in reads as the default push.
  it.each([
    ["an expansion with no literal text before it", "git push origin \"$(git branch --show-current)\""],
    ["a literal prefix of the default branch", "git push origin HEAD:tru$(echo nk)"],
    ["a literal prefix of the ref namespace", "git push origin HEAD:refs/he$(echo ads/trunk)"],
    ["a literal prefix of HEAD", "git push origin H$(echo EAD)"],
    ["an expansion before the colon", "git push origin $(echo HEAD:trunk)"],
    ["a literal prefix of a local tag", "git push origin v1$(echo .0.0)"],
    ["a literal prefix of main, always a default", "git push origin HEAD:ma$(echo in)"],
    // Red on 3021c756 (review/77): these passed on their literal prefix.
    ["a colon-less refspec whose expansion may supply the colon", "git push origin feat/a$b"],
    ["a branch name holding an unquoted group", "git push origin HEAD:refs/heads/feat(x)"],
    ["a double-quoted variable after a literal folder", "git push origin \"feat/$NAME\""],
    // Moved from the list above (build/12).
    ["the run verb's push of a branch name nesting unclosed substitution characters", `git push origin HEAD:refs/heads/stamity/x${'"$('.repeat(4)}y`],
  ])("asks for %s as a push to the default branch", (_, command) => {
    expect(personOnlyVerdict(command, TAGGED_FEATURE), command).toMatchObject({ deny: true, rule: "push-default", ask: true });
  });

  // Red on 3021c756 (review/69): the literal prefix ruled out the default branch and no deploying name was compared.
  it.each([
    ["a deploying name finished by an expansion", "git push origin HEAD:produc$(echo tion)"],
    ["a deploying pattern's folder finished by a variable", "git push origin HEAD:release/$V"],
    ["a branch built wholly by a substitution", "git push origin \"$(cat branch)\""],
  ])("asks for %s as a push to a deploying branch", (_, command) => {
    expect(personOnlyVerdict(command, DEPLOYING), command).toMatchObject({ deny: true, rule: "push-deploying", ask: true });
  });

  // Red on 3021c756 (review/69): an unquoted value may split into more refspecs or an option.
  it.each([
    ["a split-prone refspec after a literal folder", "git push origin feat/$REST", "refspec the line cannot show, which may split"],
    ["a split-prone remote word", "git push $TARGET", "remote word may split"],
  ])("asks for %s, which may split into more refspecs or an option", (_, command, act) => {
    expect(personOnlyVerdict(command, TAGGED_FEATURE), command).toMatchObject({ deny: true, rule: "push-default", ask: true, act: expect.stringContaining(act) });
  });

  it("leaves a quoted variable in the remote's place, which cannot split, to the refspecs after it", () => {
    expect(personOnlyVerdict("git push \"$REMOTE\" feat/x", TAGGED_FEATURE)).toEqual({ deny: false });
  });
});

describe("the engine's own CLI file by any path spelling (a4, review/68)", () => {
  const OWN = { ...ON_FEATURE, stricterThanDefault: true, ownRepository: true };
  const CONSUMER = { ...OWN, ownRepository: false };

  // Red on 3021c756: only the two short relative spellings took the full check in the engine's own repository.
  it.each([
    ["an absolute path with an expanded argument", "node /home/dev/engine/dist/cli.js sync \"$X\""],
    ["a dot-dot path with an xargs-fed argument", "echo --loosen | xargs node ../engine/dist/cli.js sync"],
    ["a doubled slash before the source file with a full clean", "tsx .//src//cli.ts clean"],
    ["a path opening on an expansion with an expanded argument", "node \"$ROOT/dist/cli.js\" sync \"$X\""],
    ["a working-tree-relative path with an init force", "node ./dist/cli.mjs init --force"],
  ])("gives %s the full check in the engine's own repository", (_, command) => {
    expect(personOnlyVerdict(command, OWN), command).toMatchObject({ deny: true, rule: "autonomy-loosen", ask: true });
  });

  it.each([
    ["an absolute path with an expanded argument", "node /home/dev/app/dist/cli.js build \"$X\""],
  ])("leaves %s to the literal flag alone in a consumer repository", (_, command) => {
    expect(personOnlyVerdict(command, CONSUMER), command).toEqual({ deny: false });
  });

  // TEST CHANGE, justified (REQ-FLOW-138, review/93): a script word whose last path part is a literal file name is settled
  // by that part, its folder filled in or not, so in a consumer repository a file named like the CLI there is the
  // repository's own and asks on the literal flag alone.
  it("leaves a path opening on an expansion with a full clean to the literal flag alone in a consumer repository", () => {
    expect(personOnlyVerdict("node \"$ROOT/dist/cli.js\" clean", CONSUMER)).toEqual({ deny: false });
    expect(personOnlyVerdict("node \"$ROOT/dist/cli.js\" sync --loosen", CONSUMER)).toMatchObject({ deny: true, rule: "autonomy-loosen" });
  });
});

describe("a launcher or package manager whose script or package word the shell fills in (a4, review/87)", () => {
  const DEFAULT = { ...ON_FEATURE, stricterThanDefault: false, ownRepository: false };
  const UNREAD = "A command the guard cannot read, which may be a stamity command,";

  // Red on 8c991a6d: the program was literal, so the line read as another program and nothing asked.
  it.each([
    ["node with a variable script word and a literal flag", "node \"$CLI\" sync --loosen"],
    ["node with a substitution script word and an expanded argument", "node \"$(npm root)/@zomarit/stamity/dist/cli.js\" sync \"$F\""],
    ["nodejs with a variable script word", "nodejs $CLI sync --loosen"],
    ["bun with a variable script word after an option", "bun --silent \"$CLI\" sync --loosen"],
    ["deno with a variable script word", "deno \"$CLI\" sync --loosen"],
    ["tsx with a variable script word", "tsx \"$ENTRY\" sync --loosen"],
    ["a manager's plain form with a variable bin word", "yarn \"$BIN\" sync --loosen"],
    ["a manager's run form with a variable script word", "pnpm run \"$TASK\" --loosen"],
    ["a manager's exec form after an option", "yarn --cwd app exec \"$BIN\" --loosen"],
    ["a manager's dlx form with a variable package word", "pnpm dlx \"$PKG\" sync --loosen"],
    ["a variable script word with literal arguments", "node \"$SCRIPT\" --check"],
  ])("asks for %s", (_, command) => {
    expect(personOnlyVerdict(command, DEFAULT), command).toMatchObject({ deny: true, rule: "autonomy-loosen", ask: true });
  });

  it("names the program it cannot read where the loosening rides an expanded argument", () => {
    expect(personOnlyVerdict("node \"$CLI\" sync \"$F\"", DEFAULT)).toMatchObject({ deny: true, act: expect.stringContaining(UNREAD) });
  });

  it.each([
    ["node with a literal script and literal arguments", "node scripts/build.mjs --out dist"],
    ["node with a literal script and an expanded argument", "node scripts/build.mjs \"$OUT\""],
    ["a manager's run form with a literal script", "npm run build -- \"$OUT\""],
    ["node with a path glob script", "node scripts/*.mjs --check"],
  ])("runs %s", (_, command) => {
    expect(personOnlyVerdict(command, DEFAULT), command).toEqual({ deny: false });
  });

  // Red on 8c991a6d: the land line's identity did not read such a program.
  it("reads the land verb behind a launcher whose script word the shell fills in, attended", () => {
    const attended = (command: string): ReturnType<typeof unattendedPushVerdict> => unattendedPushVerdict(command, false, true);
    expect(attended("node \"$CLI\" run land --run x").deny).toBe(true);
    expect(attended("node \"$CLI\" run checkpoint --run x")).toEqual({ deny: false });
  });
});

describe("a brace or glob form in a push's remote place (a4, review/87's record)", () => {
  const FEATURE = { defaultBranches: ["trunk"], currentBranch: "feat/x", tags: [] };

  // Red on 8c991a6d: only an unquoted variable's split read there.
  it.each([
    ["a brace form", "git push {origin,trunk}"],
    ["a glob form", "git push orig*"],
  ])("asks for %s, which may expand into a remote and refspecs", (_, command) => {
    expect(personOnlyVerdict(command, FEATURE), command).toMatchObject({ deny: true, rule: "push-default", ask: true });
    expect(personOnlyVerdict(command, { ...FEATURE, deployingBranches: ["production"] }), command).toMatchObject({ deny: true, rule: "push-deploying" });
  });

  it("leaves a quoted remote holding those characters to the refspecs after it", () => {
    expect(personOnlyVerdict("git push 'orig*' feat/x", FEATURE)).toEqual({ deny: false });
  });
});

describe("a launched program's script word found by one rule (a4, review/87 round 5, review/93)", () => {
  const DEFAULT = { ...ON_FEATURE, stricterThanDefault: false, ownRepository: false };

  // Red on 69167364 (review/87): the search stopped on an option's separate value or on a launcher's subcommand.
  it.each([
    ["an option's separate value before a filled-in script word", "node --import tsx \"$CLI\" sync --loosen"],
    ["a short preload option's value before a filled-in script word", "node -r dotenv/config \"$CLI\" sync --loosen"],
    ["a conditions value before a filled-in script word", "node --conditions development \"$CLI\" sync \"$F\""],
    ["bun's preload value before a filled-in script word", "bun --preload ./setup \"$CLI\" sync --loosen"],
    ["a launcher's subcommand before a filled-in script word", "deno run \"$CLI\" sync --loosen"],
    ["a launcher's subcommand and its option before a filled-in script word", "deno run --allow-all \"$CLI\" sync --loosen"],
    ["an inline eval with a filled-in value", "node -e \"$CODE\""],
    ["an inline eval naming a filled-in module", "bun --eval \"require('$MOD')\""],
    ["a filled-in preload value before a literal script", "node --import \"$HOOK\" scripts/x.mjs"],
  ])("asks for %s, a program the guard cannot settle", (_, command) => {
    expect(personOnlyVerdict(command, DEFAULT), command).toMatchObject({ deny: true, rule: "autonomy-loosen", ask: true });
  });

  // Red on 69167364 (review/93): these read as unreadable programs.
  it.each([
    ["a script under a filled-in repository root", "node \"$ROOT/scripts/x.mjs\" --check"],
    ["a script under the top-level path a substitution gives", "node \"$(git rev-parse --show-toplevel)/scripts/ci/test-run.mjs\" \"$A\""],
    ["a manager's filter value filled in", "pnpm --filter \"$PKG\" test"],
    ["a manager's attached filter value filled in", "pnpm --filter=$PKG test"],
    ["a manager's prefix value filled in", "npm --prefix \"$DIR\" run build"],
    ["a manager's working-folder value filled in", "yarn --cwd \"$DIR\" lint"],
    ["a manager's workspace value filled in", "npm -w \"$WS\" test"],
  ])("runs %s", (_, command) => {
    expect(personOnlyVerdict(command, DEFAULT), command).toEqual({ deny: false });
  });

  it.each([
    ["a launcher with a literal script and a filled-in argument after it", "node scripts/build.mjs \"$OUT\""],
    ["a test runner through a manager with a literal bin and filled-in files", "pnpm vitest run \"$FILE\" test/$NAME.test.ts"],
    ["a test runner through a runner with filled-in files", "npx vitest run \"$FILE\""],
    ["the repository's own script with a literal path", "node scripts/ci/test-run.mjs --coverage"],
    ["the repository's own script with a dot path", "node ./scripts/release/check.mjs"],
    // TEST CHANGE, justified (REQ-FLOW-138, review/98): round 5 put a bare flag before the script here; a script file
    // right after a bare option may be that option's value, so that layout with a filled-in word after it now asks
    // (below). The flag written with `=`, or no flag, keeps the line ordinary.
    ["deno's run form with a literal script", "deno run main.ts \"$ARG\""],
    ["deno's run form with a flag written with its value and a literal script", "deno run --allow-read=. main.ts \"$ARG\""],
  ])("runs %s, an ordinary line", (_, command) => {
    expect(personOnlyVerdict(command, DEFAULT), command).toEqual({ deny: false });
  });

  it.each([
    ["a manager option outside the folder, filter and workspace set, filled in", "pnpm --silent \"$BIN\" sync"],
    ["a filled-in bin word after a filter value", "pnpm --filter app \"$BIN\" sync"],
  ])("asks for %s", (_, command) => {
    expect(personOnlyVerdict(command, DEFAULT), command).toMatchObject({ deny: true, rule: "autonomy-loosen", ask: true });
  });
});

describe("a script file right after a bare option may be that option's value (a4, review/98)", () => {
  const DEFAULT = { ...ON_FEATURE, stricterThanDefault: false, ownRepository: false };

  // Red on fd5a101f: the preload file was taken as the script, settling the program before the filled-in script word.
  it.each([
    ["a preload file before a filled-in script word", "node --require ./preload.cjs \"$CLI\" sync --loosen"],
    ["an import file before a filled-in script word", "node --import ./register.mjs \"$CLI\" sync \"$F\""],
    ["bun's preload file before a filled-in script word", "bun --preload ./setup.ts \"$CLI\" sync --loosen"],
    ["a short preload file before a filled-in script word", "node -r ./hooks.js \"$CLI\" clean"],
    ["a bare flag, a script file and a filled-in argument", "deno run --allow-read main.ts \"$ARG\""],
  ])("asks for %s", (_, command) => {
    expect(personOnlyVerdict(command, { ...DEFAULT, stricterThanDefault: true }), command).toMatchObject({ deny: true, rule: "autonomy-loosen", ask: true });
  });

  it.each([
    ["a bare flag then a literal script with no filled-in word", "node --test test/a.test.mjs --watch"],
    ["a preload file then a literal script with a filled-in argument after it", "node --require ./preload.cjs scripts/x.mjs \"$OUT\""],
    ["an option written with its value before a literal script and a filled-in argument", "node --import=./register.mjs scripts/x.mjs \"$OUT\""],
    ["a literal script after a non-option word and a filled-in argument", "deno run main.ts \"$ARG\""],
  ])("runs %s", (_, command) => {
    expect(personOnlyVerdict(command, DEFAULT), command).toEqual({ deny: false });
  });
});

describe("an option word joined to its script-file value is never the script word (a4, review/98 round 2)", () => {
  const STRICT = { ...ON_FEATURE, stricterThanDefault: true, ownRepository: false };

  // Red on b68f5609: the joined option word's last part ended in a script extension, so it was taken as the script.
  it.each([
    ["an import option joined to its file before a filled-in script word", "node --import=./register.mjs \"$CLI\" sync --loosen"],
    ["a preload option joined to its file before a filled-in script word", "node --require=./preload.cjs \"$CLI\" clean"],
    ["bun's preload option joined to its file before a filled-in script word", "bun --preload=./setup.ts \"$CLI\" sync \"$F\""],
  ])("asks for %s", (_, command) => {
    expect(personOnlyVerdict(command, STRICT), command).toMatchObject({ deny: true, rule: "autonomy-loosen", ask: true });
  });

  it("runs the joined option before a literal script with a filled-in argument after it", () => {
    expect(personOnlyVerdict("node --import=./register.mjs scripts/x.mjs \"$OUT\"", STRICT)).toEqual({ deny: false });
  });
});

describe("a launcher read as one rule with its verbs (a4, review/99)", () => {
  const DEFAULT = { ...ON_FEATURE, stricterThanDefault: false, ownRepository: false };

  // Red on b68f5609: a launcher settled only at a script-extension word, so these asked once an argument was filled in.
  it.each([
    ["bun's package script with a filled-in argument", "bun run test \"$F\""],
    ["bun's package script with filled-in arguments after its separator", "bun run lint -- \"$X\""],
    ["bun's test runner with a filled-in file", "bun test \"$FILE\""],
    ["deno's task runner with a filled-in argument", "deno task build \"$X\""],
    ["an extensionless bin under a filled-in folder run through node", "node \"$ROOT/node_modules/.bin/vitest\" run"],
    ["deno's test tool with a filled-in file", "deno test --allow-read \"$FILE\""],
    ["tsx's watch form with a literal script and a filled-in argument", "tsx watch src/index.ts \"$ARG\""],
  ])("runs %s", (_, command) => {
    expect(personOnlyVerdict(command, DEFAULT), command).toEqual({ deny: false });
  });

  it.each([
    ["node with a filled-in script word", "node \"$CLI\" sync"],
    ["deno's run form with a filled-in script word", "deno run \"$CLI\" sync"],
    ["bun given a file path whose name is filled in", "bun \"./$NAME.ts\" sync"],
    ["bun's run form given a filled-in file", "bun run \"$FILE\" sync"],
    ["a bare flag, a literal script and a filled-in argument", "deno run --allow-read main.ts \"$ARG\""],
    ["an import option joined to its file before a filled-in script word", "node --import=./register.mjs \"$CLI\" sync"],
    ["deno given an unknown verb and a filled-in word", "deno eval \"$CODE\""],
    ["tsx's watch form with a filled-in script word", "tsx watch \"$ENTRY\""],
  ])("asks for %s", (_, command) => {
    expect(personOnlyVerdict(command, DEFAULT), command).toMatchObject({ deny: true, rule: "autonomy-loosen", ask: true });
  });
});

describe("a launcher's settling word that names this package by its last part (a4, review/100)", () => {
  const CONSUMER = { ...ON_FEATURE, stricterThanDefault: true, ownRepository: false };

  // Red on f7181e5c: the extensionless settling word settled the program as another one, so nothing asked.
  it.each([
    ["the engine's bin under a filled-in folder with a literal loosen flag", "node \"$BIN_DIR/stamity\" sync --loosen"],
    ["the second bin under a filled-in folder with a filled-in loosen flag", "node \"$BIN_DIR/st\" sync \"$FLAG\""],
    ["the engine's bin under a filled-in folder with a full clean", "tsx \"$BIN_DIR/st\" clean"],
    ["the engine's bin given to bun under a filled-in folder", "bun \"$BIN_DIR/st\" sync --loosen"],
    ["the engine's bin given to deno's run form under a filled-in folder", "deno run \"$BIN_DIR/st\" init --force"],
    ["a renamed fork's bin under a filled-in folder", "node \"$BIN_DIR/forge-cli\" sync \"$FLAG\""],
  ])("asks for %s", (_, command) => {
    const ctx = /forge/.test(command) ? { ...CONSUMER, packageWords: ["stamity", "st", "forge-cli"] } : CONSUMER;
    expect(personOnlyVerdict(command, ctx), command).toMatchObject({ deny: true, rule: "autonomy-loosen", ask: true });
  });

  it.each([
    ["an extensionless non-engine bin under a filled-in folder", "node \"$ROOT/node_modules/.bin/vitest\" run \"$F\""],
    ["bun's package script with a filled-in argument", "bun run test \"$F\""],
    ["bun's test runner with a filled-in file", "bun test \"$FILE\""],
    ["deno's task runner with a filled-in argument", "deno task build \"$X\""],
    ["the engine's bin under a filled-in folder with a literal verb", "node \"$BIN_DIR/st\" sync --json"],
  ])("runs %s", (_, command) => {
    expect(personOnlyVerdict(command, CONSUMER), command).toEqual({ deny: false });
  });
});

describe("the reading's work stays linear in the line's length (a4, review/101, review/102)", () => {
  const DEFAULT = { ...ON_FEATURE, stricterThanDefault: false };
  /**
   * The bound, measured on the lane's machine under load (2026-10-23): the linear reading takes at most 0.72 s on these
   * lines (0.46 s, 0.55 s, under 1 ms, 0.72 s), so 8 s is over ten times that, well under the guard's 30 s hook timeout;
   * the old readings take about 110 s, 140 s, 110 s and 68 s on them (each measured at a smaller size and grown by its
   * order), so each old reading is far past the bound.
   */
  const BOUND_MS = 8_000;

  // Red on b4a700fb for the last two (review/102); on f7181e5c for the first two (review/101).
  // TEST CHANGE, justified (review/115): a line past 65,536 characters now asks before any reading, so the three long
  // lines are halved to about 60,000 characters to keep timing the reader, not the cap; the old readings grow by the
  // square of the length, so at half the size they still take about 27 s, 35 s and 17 s, each past the 8 s bound.
  it.each([
    ["a long run of brace openings with no blank", () => `stamity sync ${"{".repeat(60_000)}`],
    ["a long run of parameter openings with no closing", () => `stamity sync ${"${".repeat(30_000)}`],
    ["a program word of many wildcards and a tail no package word holds", () => `/usr/bin/${"*".repeat(64)}q sync --loosen`],
    ["a long word with more brace openings than closings before its closings", () => `stamity sync x${"{".repeat(30_000)}${"}".repeat(30_000)} --loosen`],
  ])("reads %s within the bound and fails closed", (_, build) => {
    const command = build();
    expect(command.length).toBeLessThanOrEqual(65_536);
    const started = performance.now();
    const verdict = personOnlyVerdict(command, DEFAULT);
    expect(performance.now() - started).toBeLessThan(BOUND_MS);
    expect(verdict).toMatchObject({ deny: true, rule: "autonomy-loosen", ask: true });
  });
});

describe("a program word's glob matched with no regular expression (a4, review/102)", () => {
  const DEFAULT = { ...ON_FEATURE, stricterThanDefault: false };

  it.each([
    ["a class that may name the second bin", "/usr/bin/[s]t \"$F\""],
    ["stars around a package word's letters", "/usr/bin/*tam*y \"$F\""],
    // Red on b4a700fb: more wildcards than the longest package word has characters read as another program.
    ["more wildcards than the longest package word has characters", "/usr/bin/????????q \"$F\""],
  ])("asks for %s, a program the guard cannot settle", (_, command) => {
    expect(personOnlyVerdict(command, DEFAULT), command).toMatchObject({ deny: true, rule: "autonomy-loosen", ask: true });
  });

  it("runs a few wildcards whose tail no package word holds", () => {
    expect(personOnlyVerdict("/usr/bin/***q \"$F\"", DEFAULT)).toEqual({ deny: false });
  });
});

describe("the land verb's approved line (a4, review/103)", () => {
  // Red on 4d344eb2: the approved line read as no person-only act.
  it.each([
    ["the approved flag on the land line", "stamity run land --run 2026-10-23_x --approved"],
    ["the approved flag through the pinned runner", "npx --no stamity run land --run 2026-10-23_x --ready --approved --json"],
    ["the approved flag joined to a value", "stamity run land --run 2026-10-23_x --approved=true"],
    ["a land line with a filled-in word", "stamity run land --run \"$RUN\""],
    ["a land line under xargs", "echo --approved | xargs stamity run land --run x"],
    ["a land line through a program the guard cannot settle", "\"$CLI\" run land --run x --approved"],
    ["a land line with a PowerShell splat", "pwsh -Command 'stamity run land --run x @opts'"],
  ])("asks for %s", (_, command) => {
    expect(personOnlyVerdict(command, ON_FEATURE), command).toMatchObject({ deny: true, rule: "land-approved", ask: true });
  });

  it.each([
    ["a plain land line", "stamity run land --run 2026-10-23_x --ready --json"],
    ["a land line with a literal wait", "npx --no stamity run land --run 2026-10-23_x --wait 8"],
    ["a commit message naming the flag", "git commit -m 'stamity run land --approved lands an asks hold'"],
  ])("runs %s", (_, command) => {
    expect(personOnlyVerdict(command, ON_FEATURE), command).toEqual({ deny: false });
  });
});

describe("the verdicts embed no canonical package name (a4, build/10)", () => {
  // Red on 3be66b7f: the shell reading's fallback held the canonical scoped name, so every guard copy carried it.
  it("holds no scoped package name in either verdict's source", () => {
    expect(personOnlyVerdict.toString()).not.toContain("@zomarit/stamity");
    expect(unattendedPushVerdict.toString()).not.toContain("@zomarit/stamity");
  });

  it("still reads this package for a caller that names no identity, as the run verb's own push check does", () => {
    const RUN_VERB_CONTEXT = { defaultBranches: ["main"], currentBranch: "stamity/2026-10-23_x", tags: [] };
    expect(personOnlyVerdict("git push origin HEAD:refs/heads/stamity/2026-10-23_x", RUN_VERB_CONTEXT)).toEqual({ deny: false });
    expect(personOnlyVerdict("git push origin HEAD:refs/heads/main", RUN_VERB_CONTEXT)).toMatchObject({ deny: true, rule: "push-default" });
    for (const command of ["stamity sync --loosen", "node node_modules/.bin/st sync \"$X\"", "node node_modules/@zomarit/stamity/dist/cli.js sync \"$X\""]) {
      expect(personOnlyVerdict(command, RUN_VERB_CONTEXT), command).toMatchObject({ deny: true, rule: "autonomy-loosen" });
    }
  });
});

/**
 * a5-guard-heredoc-data (REQ-FLOW-141, review/76): a heredoc body that only a data sink receives is skipped by both
 * verdicts, and every other form keeps the reading as built. The sinks: a bare `cat` or `tee` first on the line writing
 * to a plain file; a bare `cat` inside a double-quoted substitution that is a whole argument word of a plain first
 * program (the commit-message pattern); the engine's own CLI reading the body on its stdin. Each refusing case carries
 * the same body as an allowed one, one fact away.
 */
describe("a heredoc body read as data only where a data sink receives it (a5, REQ-FLOW-141, review/76)", () => {
  // TEST CHANGE, justified (build/10 meets a5): the verdicts' fallback package name is empty for a caller that names no
  // identity (build/10), so this block names this package's identity as the emitted guard bakes it for this repository
  // (`contextsOf`): `packageName` on the person-only verdict's context and the same name on the unattended verdict's
  // identity. Without it the pinned package is not read as the engine, and its stdin body is read as commands.
  const PACKAGE_NAME = "@zomarit/stamity";
  const DEFAULT = { ...ON_FEATURE, stricterThanDefault: false, packageName: PACKAGE_NAME };
  const IDENTITY = { name: PACKAGE_NAME } as const;
  const FORCE = "git push --force origin feat/x";
  const both = (command: string): readonly unknown[] => [personOnlyVerdict(command, DEFAULT), unattendedPushVerdict(command, false, false, IDENTITY)];

  // Red on 84a42e9a: each body line was read as a command, the force push refused and the glob or bare-expansion
  // line asked as a loosening; unattended, the push line was refused as a raw push.
  it.each([
    ["a quoted-delimiter body appended to a record file by cat", `cat >> .stamity/runs/x/notes.md <<'EOF'\n${FORCE}\nEOF`],
    ["a double-quoted-delimiter body written to a file by cat", `cat > notes.md << "EOF"\n${FORCE}\n* a bullet\nEOF`],
    ["a tab-stripped body and terminator written by cat", `cat > notes.md <<-'EOF'\n\t${FORCE}\n\tEOF`],
    ["a bare-delimiter body with no substitution written by cat", `cat > notes.md <<EOF\n${FORCE}\n$HOME stays text\nEOF`],
    ["a body written by cat to the null device", `cat > /dev/null <<'EOF'\n${FORCE}\nEOF`],
    ["a body appended by tee to plain files, its own output to the null device", `tee -a notes.md log.md > /dev/null <<'EOF'\n${FORCE}\nEOF`],
    ["a commit message read by cat inside a quoted substitution", `git commit -m "$(cat <<'EOF'\n${FORCE}\nEOF\n)"`],
    [
      "a commit message with a bullet and a bare expansion line (review/76)",
      `git commit -s -m "$(cat <<'EOF'\nfix(hooks): read a body as data\n\n* the first bullet\n$HOME is text here\nEOF\n)"`,
    ],
    ["a pull request comment read by cat inside a quoted substitution", `gh pr comment 5 --body "$(cat <<'EOF'\n* a bullet\n${FORCE}\nEOF\n)"`],
    [
      "a learn capture whose body comes on its stdin (review/76)",
      `npx --no stamity learn capture --title t --summary 's' --confidence high <<'EOF'\n## Why\n* a bullet\n$HOME\n## How to apply\n${FORCE}\nEOF`,
    ],
    ["a learn capture through the engine's bin", `stamity learn capture --title t <<'EOF'\n* a\n${FORCE}\nEOF`],
    ["a learn capture through the pinned package", `npx -y @zomarit/stamity@1.16.0 learn capture --title t <<'EOF'\n* a\n${FORCE}\nEOF`],
  ])("skips %s in both verdicts", (_, command) => {
    expect(both(command), command).toEqual([{ deny: false }, { deny: false }]);
  });

  it("still reads the operator's own line and every line after the terminator", () => {
    // (6) An act after `&&` on the operator's line, and one after the terminator, are still read.
    for (const command of [
      `cat > notes.md <<'EOF' && ${FORCE}\nbody\nEOF`,
      `cat > notes.md <<'EOF'\nbody\nEOF\n${FORCE}`,
      `git commit -m "$(cat <<'EOF'\nbody\nEOF\n)" && ${FORCE}`,
      `stamity learn capture <<'EOF' && ${FORCE}\nbody\nEOF`,
    ]) {
      expect(personOnlyVerdict(command, DEFAULT), command).toMatchObject({ deny: true, rule: "force-push" });
      expect(unattendedPushVerdict(command, false, false, IDENTITY).deny, command).toBe(true);
    }
  });

  // Each keeps today's reading: the body's force push is read as a command and refused.
  it.each([
    // (2), (4): the body consumed by a shell, or piped onward.
    ["a body a shell reads on its stdin", `bash <<'EOF'\n${FORCE}\nEOF`],
    ["a body cat pipes onward into a shell", `cat <<'EOF' | sh\n${FORCE}\nEOF`],
    ["a file write whose segment pipes onward", `cat > notes.md <<'EOF' | sh\n${FORCE}\nEOF`],
    // (3): an unquoted delimiter whose body holds a substitution or a backtick.
    ["a bare delimiter whose body holds a substitution", `cat >> notes.md <<EOF\n$(${FORCE})\nEOF`],
    ["a bare delimiter whose body holds a backtick", `cat >> notes.md <<EOF\n\`${FORCE}\`\nEOF`],
    // (5): no terminator line.
    ["a body with no terminator line", `cat > notes.md <<'EOF'\n${FORCE}`],
    ["a terminator that differs by a trailing blank", `cat > notes.md <<'EOF'\n${FORCE}\nEOF \n`],
    ["a terminator indented with blanks under the tab-stripping form", `cat > notes.md <<-'EOF'\n${FORCE}\n  EOF`],
    // (7): a target that is no plain file.
    ["a write to a device other than the null device", `cat > /dev/tty <<'EOF'\n${FORCE}\nEOF`],
    ["a write to a descriptor path", `cat > /dev/fd/3 <<'EOF'\n${FORCE}\nEOF`],
    ["a write under the git directory", `cat > .git/hooks/pre-push <<'EOF'\n${FORCE}\nEOF`],
    ["a write to a filled-in path", `cat > "$OUT" <<'EOF'\n${FORCE}\nEOF`],
    ["cat writing to its standard output", `cat <<'EOF'\n${FORCE}\nEOF`],
    ["tee with its standard output not redirected", `tee notes.md <<'EOF'\n${FORCE}\nEOF`],
    ["a tee operand that is a process substitution", `tee >(bash) > /dev/null <<'EOF'\n${FORCE}\nEOF`],
    ["a tee operand naming standard output", `tee - > notes.md <<'EOF'\n${FORCE}\nEOF`],
    // (8): a later word names the written file.
    ["a later word naming the written file", `cat > run.sh <<'EOF'\n${FORCE}\nEOF\nsh run.sh`],
    ["a later word on the operator's line naming the written file", `cat > run.sh <<'EOF' && bash ./run.sh\n${FORCE}\nEOF`],
    // The plan gate's clauses: the program word, what stands earlier, the delimiter set, a carriage return.
    ["cat by a path", `/bin/cat > notes.md <<'EOF'\n${FORCE}\nEOF`],
    ["cat under a wrapper", `command cat > notes.md <<'EOF'\n${FORCE}\nEOF`],
    ["cat with an argument", `cat - > notes.md <<'EOF'\n${FORCE}\nEOF`],
    ["cat after a PATH assignment on its own command", `PATH=/tmp/x cat > notes.md <<'EOF'\n${FORCE}\nEOF`],
    ["cat after an earlier command on the line", `cd /tmp && cat > notes.md <<'EOF'\n${FORCE}\nEOF`],
    ["a delimiter with a character outside the set", `cat > notes.md <<'E-F'\n${FORCE}\nE-F`],
    ["a delimiter quoted twice over", `cat > notes.md <<'E'"OF"\n${FORCE}\nEOF`],
    ["a carriage return in the terminator line", `cat > notes.md <<'EOF'\n${FORCE}\nEOF\r`],
    ["two heredocs before one line break", `cat > a.md <<'A' > b.md <<'B'\n${FORCE}\nA\n${FORCE}\nB`],
    ["a heredoc on another descriptor", `cat > notes.md 3<<'EOF'\n${FORCE}\nEOF`],
    // The substitution receiver (review/76): fed to a shell, piped onward, captured as the program word, a bare
    // delimiter holding a substitution, earlier definitions, an output written to a file.
    ["a substitution a shell runs as its script", `sh -c "$(cat <<'EOF'\n${FORCE}\nEOF\n)"`],
    ["a substitution eval runs", `eval "$(cat <<'EOF'\n${FORCE}\nEOF\n)"`],
    ["a substitution captured as the program word", `"$(cat <<'EOF'\n${FORCE}\nEOF\n)"`],
    ["a substitution whose command pipes onward into a shell", `echo "$(cat <<'EOF'\n${FORCE}\nEOF\n)" | sh`],
    ["a substitution whose command writes its output to a file", `echo "$(cat <<'EOF'\n${FORCE}\nEOF\n)" > run.sh`],
    ["a substitution under a wrapper", `sudo echo "$(cat <<'EOF'\n${FORCE}\nEOF\n)"`],
    ["a substitution joined to other text in its word", `git commit -m"$(cat <<'EOF'\n${FORCE}\nEOF\n)"`],
    ["an unquoted substitution", `git commit -m $(cat <<'EOF'\n${FORCE}\nEOF\n)`],
    ["a substitution under a bare delimiter holding a substitution", `git commit -m "$(cat <<EOF\n$(${FORCE})\nEOF\n)"`],
    ["a substitution whose cat writes to a file", `git commit -m "$(cat > notes.md <<'EOF'\n${FORCE}\nEOF\n)"`],
    ["a substitution whose heredoc command is not cat", `git commit -m "$(bash <<'EOF'\n${FORCE}\nEOF\n)"`],
    ["a substitution after a function defined earlier on the line", `cat() { bash; }; git commit -m "$(cat <<'EOF'\n${FORCE}\nEOF\n)"`],
    ["a substitution after an alias defined earlier on the line", `alias cat=bash; git commit -m "$(cat <<'EOF'\n${FORCE}\nEOF\n)"`],
    ["a substitution after a PATH assignment earlier on the line", `PATH=/tmp/x; git commit -m "$(cat <<'EOF'\n${FORCE}\nEOF\n)"`],
    ["a substitution inside a line a shell runs", `bash -c 'git commit -m "$(cat <<EOF\n${FORCE}\nEOF\n)"'`],
    // The engine receiver (review/76): a same-named file elsewhere, a wrapper, an earlier definition, a pipe.
    ["a same-named file elsewhere reading the body", `./bin/stamity learn capture <<'EOF'\n${FORCE}\nEOF`],
    ["the engine's name under a launcher", `node ./stamity.js learn capture <<'EOF'\n${FORCE}\nEOF`],
    ["the engine under xargs, which makes the body its arguments", `xargs stamity learn capture <<'EOF'\n${FORCE}\nEOF`],
    ["the engine after a function defined earlier on the line", `stamity() { bash; }; stamity learn capture <<'EOF'\n${FORCE}\nEOF`],
    ["the engine after a PATH assignment earlier on the line", `export PATH=/tmp/x; stamity learn capture <<'EOF'\n${FORCE}\nEOF`],
    ["the engine whose output pipes onward", `stamity learn capture <<'EOF' | sh\n${FORCE}\nEOF`],
    ["npx with another first option", `npx --package x stamity learn capture <<'EOF'\n${FORCE}\nEOF`],
    ["npx of another package's pinned version", `npx -y other@1.0.0 learn capture <<'EOF'\n${FORCE}\nEOF`],
  ])("keeps the reading as built for %s", (_, command) => {
    expect(personOnlyVerdict(command, DEFAULT), command).toMatchObject({ deny: true, rule: "force-push" });
    expect(unattendedPushVerdict(command, false, false, IDENTITY).deny, command).toBe(true);
  });

  it("keeps a run verb named in a data body refused unattended, as the raw text names it", () => {
    const command = "cat >> notes.md <<'EOF'\nthen stamity run end --run x closes it\nEOF";
    expect(personOnlyVerdict(command, DEFAULT)).toEqual({ deny: false });
    expect(unattendedPushVerdict(command, false, false, IDENTITY)).toMatchObject({ deny: true, reason: expect.stringContaining("REQ-FLOW-121") });
  });

  it("keeps an argument word's mark on the outer command, so a filled-in loosening still asks", () => {
    const command = "stamity sync \"$(cat <<'EOF'\n--loosen\nEOF\n)\"";
    expect(personOnlyVerdict(command, DEFAULT)).toMatchObject({ deny: true, rule: "autonomy-loosen", ask: true });
  });

  it("reads a line of many unterminated heredoc operators within the bound and fails closed", () => {
    // Under the 65,536-character cap (review/115), so the reading itself is timed.
    const command = `${"stamity learn capture <<A\n".repeat(2_400)}${FORCE}`;
    expect(command.length).toBeLessThanOrEqual(65_536);
    const started = performance.now();
    const verdict = personOnlyVerdict(command, DEFAULT);
    expect(performance.now() - started).toBeLessThan(8_000);
    expect(verdict).toMatchObject({ deny: true, rule: "force-push" });
  });
});

/**
 * a5, build/12: a substitution's closing scan passes over a quoted heredoc body, so a parenthesis in it cannot end the
 * substitution early or keep it open; a scan nothing closes on the line leaves the rest of the line unread, filled in, so
 * an act behind it asks or is refused and is never one allowed word.
 */
describe("a substitution's closing scan over a quoted heredoc body, and one nothing closes (a5, build/12)", () => {
  const DEFAULT = { ...ON_FEATURE, stricterThanDefault: false };
  const FORCE = "git push --force origin feat/x";

  // Red on 77116591 for the two opening-parenthesis rows: the body's parenthesis kept the substitution open to the line's
  // end, so the push was never read. The closing-parenthesis, unquoted and balanced rows are their neighbours, which held.
  it.each([
    ["an unbalanced opening parenthesis in a quoted commit-message body", `git commit -m "$(cat <<'EOF'\nfix (the reader\nEOF\n)x y" && ${FORCE}`],
    ["an unbalanced closing parenthesis in a quoted commit-message body", `git commit -m "$(cat <<'EOF'\nfix the reader)\nEOF\n)" && ${FORCE}`],
    ["an unbalanced parenthesis in a tab-stripped body", `git commit -m "$(cat <<-'EOF'\n\tfix (a\n\tEOF\n)x y" && ${FORCE}`],
    ["an unbalanced parenthesis in an unquoted substitution's quoted body", `git commit -m $(cat <<'EOF'\n(\nEOF\n) && ${FORCE}`],
    ["a balanced quoted commit-message body", `git commit -m "$(cat <<'EOF'\nfix (the reader)\nEOF\n)" && ${FORCE}`],
  ])("refuses the push behind %s", (_, command) => {
    expect(personOnlyVerdict(command, DEFAULT), command).toMatchObject({ deny: true, rule: "force-push", ask: false });
    expect(unattendedPushVerdict(command).deny, command).toBe(true);
  });

  it.each([
    ["an unbalanced parenthesis in a quoted commit-message body", `git commit -m "$(cat <<'EOF'\nfix (the reader\nEOF\n)"`],
    ["a balanced quoted commit-message body", `git commit -m "$(cat <<'EOF'\nfix (the reader)\nEOF\n)"`],
  ])("runs the commit alone with %s", (_, command) => {
    expect(personOnlyVerdict(command, DEFAULT), command).toEqual({ deny: false });
    expect(unattendedPushVerdict(command), command).toEqual({ deny: false });
  });

  // Red on 77116591 for the unquoted-delimiter and unterminated rows: the open substitution was one allowed word, and the
  // act behind it was not read. The quoted-parenthesis row held there by another reading, and still holds.
  it.each([
    ["a quoted parenthesis no closing scan counts past", `git commit -m "$(printf '(')" && ${FORCE}`],
    ["an unbalanced parenthesis in an unquoted-delimiter body", `git commit -m "$(cat <<EOF\nfix (a\nEOF\n)x y" && ${FORCE}`],
    ["an unterminated quoted body", `git commit -m "$(cat <<'EOF'\n(\n)x y" && ${FORCE}`],
  ])("asks or refuses for %s, the rest of the line read as filled in", (_, command) => {
    expect(personOnlyVerdict(command, DEFAULT), command).toMatchObject({ deny: true });
  });

  it("reads the word an open substitution leaves as filled in, so a loosening may hide there", () => {
    expect(personOnlyVerdict(`stamity sync "$(printf '(')"`, DEFAULT)).toMatchObject({ deny: true, rule: "autonomy-loosen", ask: true });
  });
});

/**
 * a5, review/115, review/117: a line past 64 KiB is one the guard cannot read, so it is refused in every mode before any
 * reading, under its own refuse-class rule, so no act padded past the cap is one click away.
 */
describe("a line too long for the guard to read (a5, review/115, review/117)", () => {
  const DEFAULT = { ...ON_FEATURE, stricterThanDefault: false };

  // Red on 77116591: the long benign line was read and allowed. TEST CHANGE, justified (review/117): it was an ask
  // under `autonomy-loosen`; it is now refused under its own refuse-class rule, and the land-only reading refuses it too.
  it("refuses a benign line past 65,536 characters in both verdicts, under its own refuse-class rule", () => {
    const command = `echo ${"a".repeat(70_000)}`;
    expect(personOnlyVerdict(command, DEFAULT)).toMatchObject({
      deny: true,
      rule: "line-too-long",
      ask: false,
      act: expect.stringContaining("A line too long for the guard to read"),
      reason: expect.stringContaining("the person runs it themselves"),
    });
    const refused = { deny: true, reason: expect.stringContaining("A line too long for the guard to read") };
    expect(unattendedPushVerdict(command)).toMatchObject(refused);
    expect(unattendedPushVerdict(command, false, true)).toMatchObject(refused);
    expect(unattendedPushVerdict(command, true)).toMatchObject(refused);
  });

  it("reads benign lines of 60,000, 65,535 and 65,536 characters as today, and refuses one character past the cap", () => {
    const command = `echo ${"a".repeat(59_995)}`;
    expect(command.length).toBe(60_000);
    expect(personOnlyVerdict(command, DEFAULT)).toEqual({ deny: false });
    expect(unattendedPushVerdict(command)).toEqual({ deny: false });
    for (const length of [65_535, 65_536]) {
      const line = `echo ${"a".repeat(length - 5)}`;
      expect(personOnlyVerdict(line, DEFAULT), String(length)).toEqual({ deny: false });
      expect(unattendedPushVerdict(line), String(length)).toEqual({ deny: false });
    }
    expect(personOnlyVerdict(`echo ${"a".repeat(65_532)}`, DEFAULT)).toMatchObject({ deny: true, rule: "line-too-long", ask: false });
  });

  // TEST CHANGE, justified (review/117): this row pinned an ask for a padded force push, which made a refuse-class act
  // one click away on an asking client; a line past the cap is now refused whatever acts it holds.
  it.each([
    ["a force push padded past the cap", `git push --force origin feat/x; echo ${"a".repeat(70_000)}`],
    ["a repository deletion padded past the cap", `gh repo delete o/r --yes; echo ${"a".repeat(70_000)}`],
    ["an ask-class merge padded past the cap", `gh pr merge 3 --squash; echo ${"a".repeat(70_000)}`],
  ])("refuses %s, before reading it", (_, command) => {
    expect(personOnlyVerdict(command, DEFAULT)).toMatchObject({ deny: true, rule: "line-too-long", ask: false });
    expect(unattendedPushVerdict(command).deny).toBe(true);
  });
});

/**
 * a5, review/118: `git commit` reading its message on stdin, and `gh pr create`, `edit` or `comment` reading its body on
 * stdin, are data receivers under every REQ-FLOW-141 clause that applies; every other form keeps the reading as built.
 */
describe("a message read on stdin by git commit or gh pr as data (a5, review/118)", () => {
  const DEFAULT = { ...ON_FEATURE, stricterThanDefault: false };
  const FORCE = "git push --force origin feat/x";
  const BODY = `fix(hooks): read a body as data\n\n* the first bullet\n$HOME is text here\n${FORCE}`;

  // Red on 87c72904: each body line was read as a command, its force push refused.
  it.each([
    ["git commit with -F -", `git commit -s -F - <<'EOF'\n${BODY}\nEOF`],
    ["git commit with --file -", `git commit --file - <<'EOF'\n${BODY}\nEOF`],
    ["git commit with --file=-", `git commit --file=- <<"EOF"\n${BODY}\nEOF`],
    ["git commit with -F - and a bare delimiter", `git commit -F - <<EOF\n${BODY}\nEOF`],
    ["gh pr comment with --body-file -", `gh pr comment 5 --body-file - <<'EOF'\n${BODY}\nEOF`],
    ["gh pr comment with -F -", `gh pr comment 5 -F - <<'EOF'\n${BODY}\nEOF`],
  ])("skips the body of %s in both verdicts", (_, command) => {
    expect(personOnlyVerdict(command, DEFAULT), command).toEqual({ deny: false });
    expect(unattendedPushVerdict(command), command).toEqual({ deny: false });
  });

  // Red on 87c72904. Unattended, `gh pr create` and `gh pr edit` stay refused as push-path acts by their own rule.
  it.each([
    ["gh pr create with --body-file -", `gh pr create --title t --body-file - <<'EOF'\n${BODY}\nEOF`],
    ["gh pr edit with -F -", `gh pr edit 5 -F - <<'EOF'\n${BODY}\nEOF`],
  ])("skips the body of %s in the person-only verdict", (_, command) => {
    expect(personOnlyVerdict(command, DEFAULT), command).toEqual({ deny: false });
    expect(unattendedPushVerdict(command), command).toMatchObject({ deny: true, reason: expect.stringContaining("`gh pr") });
  });

  it("still reads the operator's own line and every line after the terminator", () => {
    for (const command of [`git commit -F - <<'EOF' && ${FORCE}\nbody\nEOF`, `gh pr comment 5 -F - <<'EOF'\nbody\nEOF\n${FORCE}`]) {
      expect(personOnlyVerdict(command, DEFAULT), command).toMatchObject({ deny: true, rule: "force-push" });
    }
  });

  it.each([
    ["git commit under a wrapper", `sudo git commit -F - <<'EOF'\n${FORCE}\nEOF`],
    ["git commit under env", `env GIT_EDITOR=true git commit -F - <<'EOF'\n${FORCE}\nEOF`],
    ["git commit after an assignment", `X=1 git commit -F - <<'EOF'\n${FORCE}\nEOF`],
    ["git commit with another program first on the line", `cd /tmp && git commit -F - <<'EOF'\n${FORCE}\nEOF`],
    ["git commit piped onward", `git commit -F - <<'EOF' | sh\n${FORCE}\nEOF`],
    ["git commit by a path", `/usr/bin/git commit -F - <<'EOF'\n${FORCE}\nEOF`],
    ["git with a global option before commit", `git -C . commit -F - <<'EOF'\n${FORCE}\nEOF`],
    ["git commit reading its message from a file", `git commit -F msg.txt <<'EOF'\n${FORCE}\nEOF`],
    ["git commit with its stdin flag filled in", `git commit -F "$M" <<'EOF'\n${FORCE}\nEOF`],
    ["git commit with another redirection", `git commit -F - < other.txt <<'EOF'\n${FORCE}\nEOF`],
    ["git commit under a bare delimiter whose body holds a substitution", `git commit -F - <<EOF\n$(${FORCE})\nEOF`],
    ["git commit with no terminator line", `git commit -F - <<'EOF'\n${FORCE}`],
    ["git commit with a carriage return in the terminator", `git commit -F - <<'EOF'\n${FORCE}\nEOF\r`],
    ["git commit with a delimiter outside the set", `git commit -F - <<'E-F'\n${FORCE}\nE-F`],
    ["another git subcommand reading stdin", `git apply -F - <<'EOF'\n${FORCE}\nEOF`],
    ["gh pr with another subcommand", `gh pr merge 5 -F - <<'EOF'\n${FORCE}\nEOF`],
    ["gh pr comment reading its body from a file", `gh pr comment 5 --body-file b.md <<'EOF'\n${FORCE}\nEOF`],
    ["gh pr comment under xargs", `xargs gh pr comment 5 -F - <<'EOF'\n${FORCE}\nEOF`],
    ["gh pr comment piped onward", `gh pr comment 5 -F - <<'EOF' | bash\n${FORCE}\nEOF`],
    ["gh with an option before pr", `gh -R o/r pr comment 5 -F - <<'EOF'\n${FORCE}\nEOF`],
  ])("keeps the reading as built for %s", (_, command) => {
    expect(personOnlyVerdict(command, DEFAULT), command).toMatchObject({ deny: true, rule: "force-push" });
    expect(unattendedPushVerdict(command).deny, command).toBe(true);
  });
});

/**
 * a4c-outside-party (REQ-FLOW-134): a gh write that reaches another repository, or whose inline body or title names a
 * person, asks (`outside-write`, ask-class), read against the origin the context carries. The guard's half (the origin
 * and gh's default read from the git config, the client's answer) is pinned in test/hooks/personOnlyGuard.test.ts.
 */
describe("writes that reach an outside party (a4c, REQ-FLOW-134)", () => {
  /** The session repository is `acme/app` on github.com, its only remote the origin. */
  const ORIGIN = { ...ON_FEATURE, originRepo: "github.com/acme/app" };
  const rule = (command: string, ctx: Ctx = ORIGIN): string | null => {
    const verdict = personOnlyVerdict(command, ctx);
    return verdict.deny ? verdict.rule : null;
  };

  it.each([
    ["an HTTPS remote URL", "https://github.com/acme/app.git", "github.com/acme/app"],
    ["an SSH remote URL in scp form", "git@github.com:acme/app.git", "github.com/acme/app"],
    ["an ssh:// remote URL", "ssh://git@github.com/acme/app", "github.com/acme/app"],
    // TEST CHANGE, justified (REQ-PLUGIN-033): the input is split at its `@` and joined at run time,
    // byte-identical, so the source carries no URL with a user:password pair; the title is unchanged.
    ["a URL carrying a credential, mixed case and a trailing slash", ["https://x:tok", "@github.com/Acme/App/"].join(""), "github.com/acme/app"],
    ["an Enterprise remote URL", "https://ghe.example.com/acme/app.git", "ghe.example.com/acme/app"],
    ["a -R value naming no host", "acme/app", "github.com/acme/app"],
    ["a -R value naming its host", "ghe.example.com/acme/app", "ghe.example.com/acme/app"],
    ["a pull request URL", "https://github.com/other/repo/pull/3", "github.com/other/repo"],
    ["a local path remote", "/srv/git/app.git", ""],
    ["a relative path remote", "../app.git", ""],
    ["a value holding an expansion", "$REPO", ""],
  ])("reads %s as one repository key", (_, text, key) => {
    expect(repositoryKey(text, "github.com")).toBe(key);
  });

  it("carries the exported key reader inside the verdict code for code", () => {
    const source = readFileSync(fileURLToPath(new URL("../../src/hooks/personOnly.ts", import.meta.url)), "utf8");
    const copy = /\/\/ <repository-key>\n(?:\s*\/\/[^\n]*\n)*([\s\S]*?)\s*\/\/ <\/repository-key>/.exec(source)?.[1] ?? "";
    const exported = /\nexport (function repositoryKey[\s\S]*?\n})\n/.exec(source)?.[1] ?? "";
    expect(exported.length).toBeGreaterThan(200);
    const unindented = copy.split("\n").map((line) => line.replace(/^ {2}/, "")).join("\n");
    expect(unindented.trim().replace(/^function repoKey\(/, "function repositoryKey(")).toBe(exported.trim());
  });

  it("is off for a caller that names no origin, as the run verbs read only their own push", () => {
    expect(personOnlyVerdict("gh pr comment 3 --body x -R other/repo", ON_FEATURE)).toEqual({ deny: false });
    expect(personOnlyVerdict("gh pr comment 3 --body '@alice look'", ON_FEATURE)).toEqual({ deny: false });
  });

  it.each([
    ["a comment naming the origin by owner and repository", "gh pr comment 3 --body x -R acme/app", null],
    ["a comment naming the origin by its URL", "gh pr comment https://github.com/acme/app/pull/3 --body x", null],
    ["a comment naming no target", "gh pr comment 3 --body x", null],
    ["a pull request opened on the origin by --repo", "gh pr create --repo acme/app --title t --body b", null],
    ["a read of another repository", "gh pr view 3 -R other/repo", null],
    ["a REST read of another repository", "gh api repos/other/repo/issues/1/comments", null],
    ["a REST write on the origin", "gh api -X POST repos/acme/app/issues/1/comments -f body=x", null],
    ["a REST write through gh's placeholders", "gh api -X POST repos/{owner}/{repo}/issues/1/comments -f body=x", null],
    ["a REST write through the API host's URL", "gh api -X POST https://api.github.com/repos/acme/app/issues/1/comments -f body=x", null],
    ["a comment on another repository by -R", "gh pr comment 3 --body x -R other/repo", "outside-write"],
    ["a comment on another repository by --repo=", "gh issue comment 3 --body x --repo=other/repo", "outside-write"],
    ["a comment on another repository by an attached -R", "gh issue comment 3 --body x -Rother/repo", "outside-write"],
    ["a comment on another repository by its URL", "gh issue comment https://github.com/other/repo/issues/3 --body x", "outside-write"],
    ["a comment on the same owner and repository on another host", "gh pr comment 3 --body x -R ghe.example.com/acme/app", "outside-write"],
    ["a comment whose -R value the shell fills in", "gh pr comment 3 --body x -R \"$REPO\"", "outside-write"],
    ["an issue opened on another repository", "gh issue create -R other/repo --title t --body b", "outside-write"],
    ["a REST write on another repository", "gh api -X POST repos/other/repo/issues/1/comments -f body=x", "outside-write"],
    ["a REST write a field makes", "gh api repos/other/repo/issues/1/comments -f body=x", "outside-write"],
    ["a REST write on another host by --hostname", "gh api --hostname ghe.example.com -X POST repos/acme/app/issues/1/comments -f body=x", "outside-write"],
    ["a REST write whose path walks out by dot segments", "gh api -X POST repos/acme/app/../../other/repo/issues/1/comments -f body=x", "outside-write"],
    ["a REST write on a repository named by id", "gh api -X POST repositories/42/issues/1/comments -f body=x", "outside-write"],
    ["a REST write whose owner the shell fills in", "gh api -X POST repos/$OWNER/app/issues/1/comments -f body=x", "outside-write"],
    ["a comment with GH_REPO set on the line", "GH_REPO=other/repo gh pr comment 3 --body x", "outside-write"],
    ["a comment with GH_HOST exported earlier on the line", "export GH_HOST=ghe.example.com; gh pr comment 3 --body x", "outside-write"],
    ["a comment under env setting GH_REPO", "env GH_REPO=other/repo gh pr comment 3 --body x", "outside-write"],
  ])("reads %s", (_, command, expected) => {
    expect(rule(command), command).toBe(expected);
  });

  it("holds any explicit target outside while the origin cannot be read", () => {
    const unread = { ...ON_FEATURE, originRepo: "" };
    expect(rule("gh pr comment 3 --body x -R acme/app", unread)).toBe("outside-write");
    // A write naming no target in a checkout with no remote is gh's own default, which this rule does not read.
    expect(rule("gh pr comment 3 --body x", unread)).toBeNull();
  });

  it.each([
    ["gh's default the guard cannot tell", null, "outside-write"],
    ["gh's default another repository", "github.com/upstream/app", "outside-write"],
    ["gh's default the origin", "github.com/acme/app", null],
    ["no remote for gh's default", "", null],
  ] as const)("reads a write naming no target where %s", (_, ghDefaultRepo, expected) => {
    expect(rule("gh pr comment 3 --body x", { ...ORIGIN, ghDefaultRepo })).toBe(expected);
    expect(rule("gh api -X POST repos/{owner}/{repo}/issues/1/comments -f body=x", { ...ORIGIN, ghDefaultRepo })).toBe(expected);
    // An explicit target is read on its own, whatever gh's default is.
    expect(rule("gh pr comment 3 --body x -R acme/app", { ...ORIGIN, ghDefaultRepo })).toBeNull();
  });

  it("reads a host-less target on the host the context names", () => {
    const enterprise = { ...ON_FEATURE, originRepo: "ghe.example.com/acme/app", ghHost: "ghe.example.com" };
    expect(rule("gh pr comment 3 --body x -R acme/app", enterprise)).toBeNull();
    expect(rule("gh pr comment 3 --body x -R acme/app", { ...enterprise, ghHost: "github.com" })).toBe("outside-write");
  });

  it.each([
    ["an inline body naming a person", "gh pr comment 3 --body '@alice please look'", "outside-write"],
    ["an inline title naming a person", "gh pr create --title '@alice fix' --body b", "outside-write"],
    ["an attached body naming a person", "gh pr comment 3 --body='cc @alice'", "outside-write"],
    ["a short attached body naming a person", "gh pr comment 3 '-b@alice'", "outside-write"],
    ["a review body naming a person", "gh pr review 3 --comment -b 'thanks @alice'", "outside-write"],
    ["a body naming a team", "gh pr comment 3 --body 'cc @acme/team'", "outside-write"],
    ["a body naming a team of an app-named organisation", "gh pr comment 3 --body 'cc @claude/team'", "outside-write"],
    ["a REST body field naming a person", "gh api -X POST repos/acme/app/issues/1/comments -f body='@alice hi'", "outside-write"],
    ["a REST raw field whose @ is text", "gh api -X POST repos/acme/app/issues/1/comments -f body=@alice", "outside-write"],
    ["a body after an unclosed backtick", "gh pr comment 3 --body 'see ` @alice'", "outside-write"],
    ["a body naming one of the repository's apps", "gh pr comment 3 --body '@codex review'", null],
    ["a body naming an app in another case and with a bot suffix", "gh pr comment 3 --body 'thanks @Dependabot[bot] and @COPILOT'", null],
    ["a body naming claude", "gh pr comment 3 --body '@claude please fix'", null],
    ["a body holding an email address", "gh pr comment 3 --body 'Co-Authored-By: x <noreply@anthropic.com>'", null],
    ["a body holding a mention inside backticks", "gh pr comment 3 --body 'run `@alice` as written'", null],
    ["a body holding no @", "gh pr comment 3 --body 'looks good'", null],
    ["a REST typed field read from a file", "gh api -X POST repos/acme/app/issues/1/comments -F body=@notes.md", null],
    ["a body read from a file", "gh pr comment 3 --body-file notes.md", null],
    ["a read whose search names a person", "gh pr list --search '@alice'", null],
  ])("reads %s", (_, command, expected) => {
    expect(rule(command), command).toBe(expected);
  });

  // a5's census point (REQ-FLOW-141): a heredoc body the reading skips as data for acts is still read for a mention.
  it.each([
    ["a heredoc on stdin to a comment's --body-file -", "gh pr comment 3 --body-file - <<'EOF'\nthanks @alice\nEOF"],
    ["a heredoc on stdin to a pull request's -F -", "gh pr create --title t -F - <<'EOF'\ncc @alice\nEOF"],
    ["a heredoc on stdin to an edit's --body-file=-", "gh pr edit 3 --body-file=- <<'EOF'\ncc @alice\nEOF"],
    ["a heredoc read by cat in a quoted substitution for the body", "gh pr create --title t --body \"$(cat <<'EOF'\nhi @alice\nEOF\n)\""],
    ["a body from a variable set earlier on the line", "B='@alice look'; gh pr comment 3 --body \"$B\""],
    ["a body piped in from echo on the line", "echo '@alice look' | gh pr comment 3 -F -"],
    ["a REST body read from stdin by --input -", "gh api -X POST repos/acme/app/issues/1/comments --input - <<'EOF'\n{\"body\":\"@alice\"}\nEOF"],
    ["a REST typed field read from stdin", "echo '@alice' | gh api -X POST repos/acme/app/issues/1/comments -F body=@-"],
  ])("reads the body of %s for a mention", (_, command) => {
    expect(rule(command), command).toBe("outside-write");
    // The same line naming nobody runs.
    expect(rule(command.replaceAll("@alice", "alice")), command).toBeNull();
  });

  it("keeps the act readings beside the rule: a refuse-class act decides, an act the setting runs never hides the ask", () => {
    expect(personOnlyVerdict("gh release delete v1 -R other/repo --yes", ORIGIN)).toMatchObject({ deny: true, rule: "release-delete", ask: false });
    const runs = { ...ORIGIN, runs: ["pr-ready", "tag", "workflow-dispatch"] as PersonOnlyRuleId[] };
    expect(personOnlyVerdict("gh pr ready 3", runs)).toEqual({ deny: false, runs: ["pr-ready"] });
    expect(personOnlyVerdict("gh pr ready https://github.com/other/repo/pull/3", runs)).toMatchObject({ deny: true, rule: "outside-write", ask: true });
    expect(personOnlyVerdict("gh workflow run ci.yml -R other/repo", runs)).toMatchObject({ deny: true, rule: "outside-write", ask: true });
    expect(personOnlyVerdict("gh pr merge 3 -R other/repo", ORIGIN)).toMatchObject({ deny: true, ask: true });
  });

  it("reads a line of many gh calls with stdin bodies and mentions within the bound", () => {
    // Every call reads its body on stdin, so the whole line is read for a mention; it is read once, not once per call.
    const command = `${"gh pr comment 1 -F - < b; ".repeat(2_000)}gh pr comment 1 --body '${"`x` @codex ".repeat(1_000)}@alice'`;
    expect(command.length).toBeLessThanOrEqual(65_536);
    const started = performance.now();
    const verdict = personOnlyVerdict(command, ORIGIN);
    expect(performance.now() - started).toBeLessThan(8_000);
    expect(verdict).toMatchObject({ deny: true, rule: "outside-write", ask: true });
  });
});

/**
 * a4c fix round 1 (REQ-FLOW-134, build/20, build/21, build/22, build/25): a GraphQL mutation by a node id the line
 * cannot place, a REST write sent by curl or wget to the GitHub API, and a reviewer or assignee naming a person ask;
 * a thread's resolve state runs; a commit message is not read. Red on dbf1a825, which allows each asking form here.
 */
describe("the outside-party readers' second round (a4c, build/20-25)", () => {
  const ORIGIN = { ...ON_FEATURE, originRepo: "github.com/acme/app" };
  const rule = (command: string, ctx: Ctx = ORIGIN): string | null => {
    const verdict = personOnlyVerdict(command, ctx);
    return verdict.deny ? verdict.rule : null;
  };

  it.each([
    ["a comment mutation by a node id", `gh api graphql -f query='mutation { addComment(input: {subjectId: "I_1", body: "x"}) { clientMutationId } }'`, "outside-write"],
    ["an issue mutation by a repository's node id", `gh api graphql -f query='mutation { createIssue(input: {repositoryId: "R_1", title: "t"}) { issue { id } } }'`, "outside-write"],
    ["an aliased comment mutation", `gh api graphql -f query='mutation { resolveReviewThread: addComment(input: {subjectId: "I_1", body: "x"}) { clientMutationId } }'`, "outside-write"],
    ["a thread resolve beside a comment mutation", `gh api graphql -f query='mutation { resolveReviewThread(input: {threadId: "T_1"}) { clientMutationId } addComment(input: {subjectId: "I_1", body: "x"}) { clientMutationId } }'`, "outside-write"],
    ["a mutation selecting through a fragment spread", `gh api graphql -f query='mutation { ...F } fragment F on Mutation { addComment(input: {subjectId: "I_1", body: "x"}) { clientMutationId } }'`, "outside-write"],
    ["a mutation whose selection names no field", `gh api graphql -f query='mutation { }'`, "outside-write"],
    ["a query read from a file", "gh api graphql -F query=@q.graphql", "outside-write"],
    ["a query the shell fills in", `gh api graphql -f query="$Q"`, "outside-write"],
    ["a GraphQL mutation sent by curl", `curl -X POST -d '{"query":"mutation { addComment(input: {subjectId: \\"I\\", body: \\"x\\"}) { clientMutationId } }"}' https://api.github.com/graphql`, "outside-write"],
    ["a thread resolve", `gh api graphql -f query='mutation { resolveReviewThread(input: {threadId: "T_1"}) { thread { isResolved } } }'`, null],
    ["a thread unresolve by an aliased variable form", `gh api graphql -f query='mutation($id: ID!) { a: unresolveReviewThread(input: {threadId: $id}) { thread { id } } }' -f id=T_1`, null],
    ["a read query", `gh api graphql -f query='query { viewer { login } }'`, null],
    ["a shorthand read query naming a mutation-like field", `gh api graphql -f query='{ viewer { mutation: login } }'`, null],
  ])("reads %s", (_, command, expected) => {
    expect(rule(command), command).toBe(expected);
  });

  it.each([
    ["a curl write to another repository", `curl -X POST -d '{"body":"x"}' https://api.github.com/repos/other/repo/issues/1/comments`, "outside-write"],
    ["a curl write with no scheme to another repository", `curl -d '{"body":"x"}' api.github.com/repos/other/repo/issues/1/comments`, "outside-write"],
    ["a wget write to another repository", `wget --post-data='{"body":"x"}' https://api.github.com/repos/other/repo/issues/1/comments`, "outside-write"],
    ["a wget write by its shortened method option", "wget --meth=PATCH https://api.github.com/repos/other/repo/issues/1", "outside-write"],
    ["a curl write whose URL the shell fills in", `curl -X POST -d '{"body":"x"}' "$URL"`, "outside-write"],
    ["a curl write after --next to another repository", `curl -s https://api.github.com/repos/acme/app --next -X POST -d '{"body":"x"}' https://api.github.com/repos/other/repo/issues/1/comments`, "outside-write"],
    ["a curl write to a data-residency API host's other repository", `curl -X POST -d '{"body":"x"}' https://api.acme.ghe.com/repos/other/repo/issues/1/comments`, "outside-write"],
    ["a curl body naming a person on the origin", `curl -X POST -d '{"body":"@alice hi"}' https://api.github.com/repos/acme/app/issues/1/comments`, "outside-write"],
    ["a curl body on stdin naming a person", `echo '{"body":"@alice"}' | curl -X POST -d @- https://api.github.com/repos/acme/app/issues/1/comments`, "outside-write"],
    ["a curl write to the origin", `curl -X POST -d '{"body":"x"}' https://api.github.com/repos/acme/app/issues/1/comments`, null],
    ["a curl body read from a file", "curl -X POST -d @body.json https://api.github.com/repos/acme/app/issues/1/comments", null],
    ["a curl read of another repository", "curl -s https://api.github.com/repos/other/repo/issues/1/comments", null],
    ["a curl write to a host that is no GitHub API", `curl -X POST -d '{"body":"@alice"}' https://hooks.example.com/notify`, null],
  ])("reads %s", (_, command, expected) => {
    expect(rule(command), command).toBe(expected);
  });

  it("reads the origin's own Enterprise API host as the GitHub API", () => {
    const enterprise = { ...ON_FEATURE, originRepo: "ghe.example.com/acme/app", ghHost: "ghe.example.com" };
    expect(rule(`curl -X POST -d '{"body":"x"}' https://ghe.example.com/api/v3/repos/acme/app/issues/1/comments`, enterprise)).toBeNull();
    expect(rule(`curl -X POST -d '{"body":"x"}' https://ghe.example.com/api/v3/repos/other/repo/issues/1/comments`, enterprise)).toBe("outside-write");
    expect(rule(`curl -X POST -d '{"query":"mutation { addComment(input: {subjectId: \\"I\\", body: \\"x\\"}) { clientMutationId } }"}' https://ghe.example.com/api/graphql`, enterprise)).toBe("outside-write");
    // On a github.com origin, that host is no GitHub API this rule reads.
    expect(rule(`curl -X POST -d '{"body":"x"}' https://ghe.example.com/api/v3/repos/other/repo/issues/1/comments`)).toBeNull();
  });

  it.each([
    ["a reviewer on a new pull request", "gh pr create --title t --body b --reviewer alice", "outside-write"],
    ["a short reviewer on a new pull request", "gh pr create --title t --body b -r alice", "outside-write"],
    ["a reviewer joined by =", "gh pr create --title t --body b --reviewer=alice", "outside-write"],
    ["a reviewer list holding a person beside an app", "gh pr create --title t --body b --reviewer @copilot,alice", "outside-write"],
    ["a reviewer team", "gh pr edit 3 --add-reviewer acme/team", "outside-write"],
    ["an added reviewer the shell fills in", `gh pr edit 3 --add-reviewer "$WHO"`, "outside-write"],
    ["an assignee on a new issue", "gh issue create --title t --body b -a bob", "outside-write"],
    ["an added assignee", "gh issue edit 3 --add-assignee bob", "outside-write"],
    ["a REST reviewer field", "gh api -X POST repos/acme/app/pulls/1/requested_reviewers -f 'reviewers[]=alice'", "outside-write"],
    ["a REST team reviewer field", "gh api -X POST repos/acme/app/pulls/1/requested_reviewers -f 'team_reviewers[]=core'", "outside-write"],
    ["a curl assignee list", `curl -X POST -d '{"assignees":["bob"]}' https://api.github.com/repos/acme/app/issues/1/assignees`, "outside-write"],
    ["an app as reviewer", "gh pr create --title t --body b --reviewer @copilot", null],
    ["the caller as assignee", "gh pr edit 3 --add-assignee @me", null],
    ["Copilot's reviewer login in a REST field", "gh api -X POST repos/acme/app/pulls/1/requested_reviewers -f 'reviewers[]=copilot-pull-request-reviewer[bot]'", null],
    ["a review's request-changes flag", "gh pr review 3 -r -b 'needs work'", null],
    ["a review comment's body flag naming nobody", "gh pr review 3 --comment -b x", null],
  ])("reads %s", (_, command, expected) => {
    expect(rule(command), command).toBe(expected);
  });

  it("leaves a commit message naming a person unread, since a mention in one notifies no one (build/25)", () => {
    expect(personOnlyVerdict("git commit -m 'thanks @alice'", ORIGIN)).toEqual({ deny: false });
    expect(personOnlyVerdict("git commit -F - <<'EOF'\nthanks @alice\nEOF", ORIGIN)).toEqual({ deny: false });
  });

  it("reads a long GraphQL selection within the bound", () => {
    const command = `gh api graphql -f query='mutation { ${"resolveReviewThread(input: {threadId: \"T\"}) { thread { id } } ".repeat(1_000)}}'`;
    expect(command.length).toBeLessThanOrEqual(65_536);
    const started = performance.now();
    expect(personOnlyVerdict(command, ORIGIN)).toEqual({ deny: false });
    expect(performance.now() - started).toBeLessThan(8_000);
  });
});

/**
 * a4c fix round 2 (REQ-FLOW-134, review/120-132): the outside-party readers read what the line hides as unseen, read
 * more targets, prose and stdin spellings, and read a push's repository. Every asking row is red on e53503b6, which
 * runs it; each sits beside a row that runs on both.
 */
describe("the outside-party readers' third round (a4c, review/120-132)", () => {
  const ORIGIN = { ...ON_FEATURE, originRepo: "github.com/acme/app" };
  const rule = (command: string, ctx: Parameters<typeof personOnlyVerdict>[1] = ORIGIN): string | null => {
    const verdict = personOnlyVerdict(command, ctx);
    return verdict.deny ? verdict.rule : null;
  };
  const RESOLVE = `mutation { resolveReviewThread(input: {threadId: \\"T\\"}) { clientMutationId } }`;

  it.each([
    ["a shown state-only query beside a request body read from a file", `gh api graphql -f query='mutation { resolveReviewThread(input: {threadId: "T"}) { clientMutationId } }' --input body.json`, "outside-write"],
    ["a shown state-only query beside a typed query read from a file", `gh api graphql -f query='mutation { resolveReviewThread(input: {threadId: "T"}) { clientMutationId } }' -F query=@other.graphql`, "outside-write"],
    ["a field whose key the shell fills in", `gh api graphql -f query='mutation { resolveReviewThread(input: {threadId: "T"}) { clientMutationId } }' -f "$K"=x`, "outside-write"],
    ["a curl GraphQL body the shell fills in, its key written with a JSON escape", `curl -X POST -d "{\\"\\\\u0071uery\\":\\"$Q\\"}" https://api.github.com/graphql`, "outside-write"],
    ["a GraphQL call after curl's --next", `curl -s https://api.github.com/repos/acme/app --next -X POST -d '{"query":"${RESOLVE}"}' https://api.github.com/graphql`, "outside-write"],
    ["a query holding a comment", `gh api graphql -f query='mutation { resolveReviewThread(input: {threadId: "T"}) { clientMutationId } } # note'`, "outside-write"],
    ["a query holding a block string", `gh api graphql -f query='mutation { resolveReviewThread(input: {threadId: """T"""}) { clientMutationId } }'`, "outside-write"],
    ["a state-only query beside a variable value the shell fills in", `gh api graphql -f query='mutation($id: ID!) { resolveReviewThread(input: {threadId: $id}) { clientMutationId } }' -f id="$TID"`, null],
    ["a curl state-only query shown whole", `curl -X POST -d '{"query":"${RESOLVE}"}' https://api.github.com/graphql`, null],
  ])("reads %s", (_, command, expected) => {
    expect(rule(command), command).toBe(expected);
  });

  it.each([
    ["an issue transferred to another repository", "gh issue transfer 3 other/repo", "outside-write"],
    ["an issue transferred by a URL", "gh issue transfer https://github.com/acme/app/issues/3 other/repo", "outside-write"],
    ["a branch developed in another repository", "gh issue develop 3 --branch-repo other/repo", "outside-write"],
    ["a branch developed in another repository by =", "gh issue develop 3 --branch-repo=other/repo", "outside-write"],
    ["a branch developed in the origin", "gh issue develop 3 --branch-repo acme/app", null],
    ["a gist created", "gh gist create notes.md", "outside-write"],
    ["a gist edited", "gh gist edit abc --add notes.md", "outside-write"],
    ["a gist read", "gh gist view abc", null],
    ["a REST follow", "gh api -X PUT user/following/alice", "outside-write"],
    ["a REST team discussion", "gh api -X POST orgs/acme/teams/core/discussions -f title=t -f body=b", "outside-write"],
    ["a REST gist through curl", `curl -X POST -d '{"files":{}}' https://api.github.com/gists`, "outside-write"],
    ["a REST write on the origin's own path", "gh api -X POST repos/acme/app/issues/1/comments -f body=x", null],
  ])("reads %s", (_, command, expected) => {
    expect(rule(command), command).toBe(expected);
  });

  it.each([
    ["a pull request's closing comment naming a person", "gh pr close 3 --comment 'cc @alice'", "outside-write"],
    ["an issue's reopening comment naming a person", "gh issue reopen 3 -c 'cc @alice'", "outside-write"],
    ["a closing comment joined by =", "gh issue close 3 --comment='cc @alice'", "outside-write"],
    ["a closing comment attached to its short flag", "gh issue close 3 '-c@alice'", "outside-write"],
    ["a closing comment naming nobody", "gh pr close 3 --comment 'done'", null],
    ["a nested review comment body naming a person", "gh api -X POST repos/acme/app/pulls/1/reviews -f event=COMMENT -f 'comments[][path]=a.ts' -f 'comments[][body]=@alice look'", "outside-write"],
    ["a nested JSON review comment body naming a person", `curl -X POST -d '{"event":"COMMENT","comments":[{"path":"a.ts","body":"@alice look"}]}' https://api.github.com/repos/acme/app/pulls/1/reviews`, "outside-write"],
    ["a nested JSON review comment body naming nobody", `curl -X POST -d '{"event":"COMMENT","comments":[{"path":"a.ts","body":"look"}]}' https://api.github.com/repos/acme/app/pulls/1/reviews`, null],
    ["a reviewer attached to its short flag", "gh pr create --title t --body b -ralice", "outside-write"],
    ["an assignee attached to its short flag", "gh issue create --title t --body b -abob", "outside-write"],
    ["the caller attached as assignee", "gh issue create --title t --body b -a@me", null],
  ])("reads %s", (_, command, expected) => {
    expect(rule(command), command).toBe(expected);
  });

  it.each([
    ["a body file at the stdin device", "gh pr comment 3 --body-file /dev/stdin <<'EOF'\nthanks @alice\nEOF"],
    ["a body file attached to its short flag", "gh pr comment 3 -F- <<'EOF'\nthanks @alice\nEOF"],
    ["a body file attached with =", "gh pr comment 3 -F=- <<'EOF'\nthanks @alice\nEOF"],
    ["a body file joined at the stdin device", "gh pr comment 3 --body-file=/dev/stdin <<'EOF'\nthanks @alice\nEOF"],
    ["a REST input at the stdin device", `echo '{"body":"@alice"}' | gh api -X POST repos/acme/app/issues/1/comments --input /dev/stdin`],
    ["a REST typed field at the stdin device", "echo '@alice' | gh api -X POST repos/acme/app/issues/1/comments -F body=@/dev/stdin"],
    ["a curl body at the stdin device", `echo '{"body":"@alice"}' | curl -X POST -d @/dev/stdin https://api.github.com/repos/acme/app/issues/1/comments`],
  ])("reads the body of %s for a mention", (_, command) => {
    expect(rule(command), command).toBe("outside-write");
    expect(rule(command.replaceAll("@alice", "alice")), command).toBeNull();
  });

  it("reads the last hostname option, as gh does, and compares hosts normalised", () => {
    const write = "-X POST repos/acme/app/issues/1/comments -f body=x";
    expect(rule(`gh api --hostname ghe.example.com --hostname github.com ${write}`)).toBeNull();
    expect(rule(`gh api --hostname github.com --hostname ghe.example.com ${write}`)).toBe("outside-write");
    expect(rule(`curl -X POST -d '{"body":"x"}' https://API.GITHUB.COM./repos/other/repo/issues/1/comments`)).toBe("outside-write");
    expect(rule(`curl -X POST -d '{"body":"x"}' https://api.github.com./repos/acme/app/issues/1/comments`)).toBeNull();
    expect(rule("gh pr comment 3 --body x -R GitHub.com./acme/app")).toBeNull();
  });

  it("holds a gh write on a line that sets git configuration through its environment outside", () => {
    expect(rule("GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=remote.origin.url GIT_CONFIG_VALUE_0=x gh pr comment 3 --body x")).toBe("outside-write");
    expect(rule("gh pr comment 3 --body x")).toBeNull();
  });

  it.each([
    ["a feature push to origin", "git push -u origin feat/x", {}, null],
    ["a push naming no remote, whose push remote is origin", "git push", { pushRemote: "origin" }, null],
    ["a push to the origin's own URL", "git push https://github.com/acme/app.git feat/x", {}, null],
    ["a push to another remote whose URL is the origin's", "git push fork feat/x", { remoteRepo: (): string => "github.com/acme/app" }, null],
    ["a push to another repository's URL", "git push https://github.com/other/repo.git feat/x", {}, "outside-write"],
    ["a push to another repository's URL in scp form", "git push git@github.com:other/repo.git feat/x", {}, "outside-write"],
    ["a push to a remote pushing to another repository", "git push upstream feat/x", { remoteRepo: (): string => "github.com/up/app" }, "outside-write"],
    ["a push to a remote the configuration does not place", "git push upstream feat/x", { remoteRepo: (): string => "" }, "outside-write"],
    ["a push whose remote word the shell fills in", `git push "$R" feat/x`, {}, "outside-write"],
    ["a push whose remote URL a -c pair sets", "git -c remote.origin.url=https://github.com/other/repo.git push origin feat/x", {}, "outside-write"],
    ["a push under git configuration set through the environment", "GIT_CONFIG_PARAMETERS=x git push origin feat/x", {}, "outside-write"],
    ["a push naming no remote, whose push remote is another repository's", "git push", { pushRemote: "upstream", remoteRepo: (): string => "github.com/up/app" }, "outside-write"],
    ["a push naming no remote, whose push remote the guard cannot tell", "git push", { pushRemote: null }, "outside-write"],
    ["a push to origin from another checkout of another repository", "git push origin feat/x", { ownCheckout: false, remoteRepo: (): string => "github.com/other/repo" }, "outside-write"],
    ["a push to origin from another checkout of the same repository", "git push origin feat/x", { ownCheckout: false, remoteRepo: (): string => "github.com/acme/app" }, null],
    ["a push by --repo to another repository", "git push --repo=https://github.com/other/repo.git", {}, "outside-write"],
    ["a subtree push to another repository", "git subtree push -P d https://github.com/other/repo.git feat/x", {}, "outside-write"],
  ] as const)("reads %s", (_, command, extra, expected) => {
    expect(rule(command, { ...ORIGIN, ...extra }), command).toBe(expected);
  });

  it("leaves a push unread for a caller naming no origin, as the run verbs' own push", () => {
    expect(personOnlyVerdict("git push https://github.com/other/repo.git feat/x", ON_FEATURE)).toEqual({ deny: false });
  });

  it("names a push's branch act before its repository, so the default branch's ask is the one shown", () => {
    expect(personOnlyVerdict("git push upstream HEAD:main", { ...ORIGIN, remoteRepo: (): string => "" })).toMatchObject({ deny: true, rule: "push-default" });
  });
});

/**
 * a4c fix round 3 (REQ-FLOW-134, review/129, review/135, review/126's widening): a remote or URL rewrite written is its
 * own rule, which the guard runs on the main thread; a push to origin is held to origin's own push URL; short-option
 * clusters are read; a curl body the shell fills in makes the whole line read; a line relocating the home or XDG folder
 * makes the configuration unreadable. Each asking row is red on a58daabe, which runs it.
 */
describe("the outside-party readers' fourth round (a4c, review/129, review/135)", () => {
  const ORIGIN = { ...ON_FEATURE, originRepo: "github.com/acme/app" };
  const rule = (command: string, ctx: Parameters<typeof personOnlyVerdict>[1] = ORIGIN): string | null => {
    const verdict = personOnlyVerdict(command, ctx);
    return verdict.deny ? verdict.rule : null;
  };

  it.each([
    ["a remote added", "git remote add up https://github.com/up/app.git", "remote-write"],
    ["a remote renamed", "git remote rename origin old", "remote-write"],
    ["a remote's URL changed", "git remote set-url origin https://github.com/other/repo.git", "remote-write"],
    ["a remote removed", "git remote remove origin", "remote-write"],
    ["a remote URL written by config", "git config remote.origin.url https://github.com/other/repo.git", "remote-write"],
    ["a push URL written by config's set subcommand", "git config set remote.origin.pushurl https://github.com/other/repo.git", "remote-write"],
    ["a URL rewrite written in the global file", "git config --global url.https://github.com/other/.insteadOf https://github.com/acme/", "remote-write"],
    ["a remote key unset", "git config --unset remote.origin.pushurl", "remote-write"],
    ["a remote section removed", "git config --remove-section remote.origin", "remote-write"],
    ["the configuration opened in an editor", "git config --edit", "remote-write"],
    ["a remote URL read", "git config --get remote.origin.url", null],
    ["a remote URL read by its key alone", "git config remote.origin.url", null],
    ["a remote URL read by the get subcommand", "git config get remote.origin.url", null],
    ["the remotes listed", "git remote -v", null],
    ["a remote's URL read", "git remote get-url origin", null],
    ["another key written", "git config user.name x", null],
  ])("reads %s", (_, command, expected) => {
    expect(rule(command), command).toBe(expected);
  });

  it("runs a remote write where the context runs the rule, as the guard's main thread does, and leaves it unread with no origin", () => {
    const runs = { ...ORIGIN, runs: ["remote-write"] as PersonOnlyRuleId[] };
    expect(personOnlyVerdict("git remote set-url origin https://github.com/other/repo.git", runs)).toEqual({ deny: false, runs: ["remote-write"] });
    expect(personOnlyVerdict("git remote set-url origin https://github.com/other/repo.git", ON_FEATURE)).toEqual({ deny: false });
  });

  it.each([
    ["origin's push URL another repository's", "github.com/other/repo", "outside-write"],
    ["origin's push URL the origin's own", "github.com/acme/app", null],
    ["no push URL apart from origin's fetch URL", null, null],
  ] as const)("reads a feature push to origin with %s", (_, originPush, expected) => {
    expect(rule("git push -u origin feat/x", { ...ORIGIN, originPush })).toBe(expected);
  });

  it.each([
    ["a review whose comment flag and body letter share a cluster", "gh pr review 3 -cb '@alice look'", "outside-write"],
    ["a new pull request whose draft flag and body letter share a cluster", "gh pr create -t t -db '@alice look'", "outside-write"],
    ["a new pull request whose draft flag and reviewer letter share a cluster", "gh pr create -t t -b b -dr alice", "outside-write"],
    ["a reviewer attached after a boolean letter", "gh pr create -t t -b b -dralice", "outside-write"],
    ["an assignee after the web flag in one cluster", "gh issue create -t t -b b -wa bob", "outside-write"],
    ["a closing comment after the delete-branch flag in one cluster, refused outright for the deletion", "gh pr close 3 -dc '@alice'", "push-delete"],
    ["a body file at stdin after a boolean letter", "gh pr comment 3 -wF - <<'EOF'\nthanks @alice\nEOF", "outside-write"],
    ["a review cluster naming nobody", "gh pr review 3 -cb 'look'", null],
  ])("reads %s", (_, command, expected) => {
    expect(rule(command), command).toBe(expected);
  });

  it("reads the whole line for a mention where a curl body holds a word the shell fills in", () => {
    const body = `curl -X POST -d "{\\"body\\":\\"$B\\"}" https://api.github.com/repos/acme/app/issues/1/comments`;
    expect(rule(`B='@alice look'; ${body}`)).toBe("outside-write");
    expect(rule(`B='look'; ${body}`)).toBeNull();
  });

  it.each([
    ["a gh write with the home folder relocated", "HOME=/tmp/h gh pr comment 3 --body x"],
    ["a gh write after the home folder is exported", "export HOME=/tmp/h; gh pr comment 3 --body x"],
    ["a feature push with the XDG folder relocated", "XDG_CONFIG_HOME=/tmp/x git push -u origin feat/x"],
  ])("holds %s outside, since git reads another global file", (_, command) => {
    expect(rule(command), command).toBe("outside-write");
    expect(rule(command.replace(/^(?:export )?\w+=\S+;? /, "")), command).toBeNull();
  });
});

/**
 * a4c fix round 4 (REQ-FLOW-134, review/143, the lens's W-1 and W-2): a curl or wget line reads whole only for a body
 * word the shell fills in, and a file's `@` is never a person; a cluster is read by gh's own short options, an unknown
 * letter leaving the line unread; an include key written is a remote write. Each asking row is red on 121a3810 beside a
 * row that runs on both.
 */
describe("the outside-party readers' fifth round (a4c, review/143, the lens's W-1 and W-2)", () => {
  const ORIGIN = { ...ON_FEATURE, originRepo: "github.com/acme/app" };
  const rule = (command: string, ctx: Parameters<typeof personOnlyVerdict>[1] = ORIGIN): string | null => {
    const verdict = personOnlyVerdict(command, ctx);
    return verdict.deny ? verdict.rule : null;
  };
  const API = "https://api.github.com/repos/acme/app/issues/1/comments";

  it.each([
    ["a curl write to the origin, its token from a variable and its body from a file", `curl -H "Authorization: Bearer $TOKEN" -X POST -d @body.json ${API}`, null],
    ["a wget write to the origin, its token from a variable and its body from a file", `wget --header="Authorization: token $TOKEN" --post-file=body.json ${API}`, null],
    ["a curl write whose body file's name reads like a login, beside a body the shell fills in", `T=t; curl -X POST -d @alice.json -d "{\\"title\\":\\"$T\\"}" ${API}`, null],
    ["a curl body the shell fills in naming a person, its token from a variable", `B='@alice look'; curl -H "Authorization: Bearer $TOKEN" -X POST -d "{\\"body\\":\\"$B\\"}" ${API}`, "outside-write"],
  ])("reads %s", (_, command, expected) => {
    expect(rule(command), command).toBe(expected);
  });

  it.each([
    ["a head value clustered before a repository option", "gh pr create -t t -b b -Hb -R other/repo"],
    ["a base value clustered before a repository option", "gh pr create -t t -b b -Bb -R other/repo"],
    ["a label value clustered before a repository option", "gh pr create -t t -b b -lb -R other/repo"],
    ["a milestone value clustered before a repository option", "gh pr create -t t -b b -mb -R other/repo"],
    ["a project value clustered before a repository option", "gh pr create -t t -b b -pb -R other/repo"],
    ["a template value clustered before a repository option", "gh pr create -t t -b b -Tb -R other/repo"],
    ["a head value clustered before a body option naming a person", "gh pr create -t t -Hb -b '@alice look'"],
    ["an issue label clustered before a repository option", "gh issue create -t t -b b -lb -R other/repo"],
    ["a letter gh does not list for the subcommand", "gh pr create -t t -b b -X"],
  ])("asks for %s", (_, command) => {
    expect(rule(command), command).toBe("outside-write");
  });

  it.each([
    ["a draft pull request", "gh pr create -d -t t -b b"],
    ["a draft flag clustered with the title letter", "gh pr create -dt t -b b"],
    ["a head value clustered and then the origin named", "gh pr create -t t -b b -Hfeat -R acme/app"],
    ["a review's comment boolean beside its body", "gh pr review 3 -c -b look"],
  ])("runs %s", (_, command) => {
    expect(rule(command), command).toBeNull();
  });

  it.each([
    ["an include path written in the global file", "git config --global include.path extra.gitconfig", "remote-write"],
    ["a conditional include path written", "git config includeIf.gitdir:/work/.path work.gitconfig", "remote-write"],
    ["an include section removed", "git config --remove-section include", "remote-write"],
    ["a remote URL written with NUL output asked for", "git config -z remote.origin.url https://github.com/other/repo.git", "remote-write"],
    ["an include path read", "git config --get include.path", null],
  ])("reads %s", (_, command, expected) => {
    expect(rule(command), command).toBe(expected);
  });

  it("holds a push to origin outside where origin's push reading is unknown", () => {
    expect(rule("git push -u origin feat/x", { ...ORIGIN, originPush: "" })).toBe("outside-write");
    expect(rule("git push -u origin feat/x", { ...ORIGIN, originPush: null })).toBeNull();
  });
});

/**
 * a4c fix round 5 (REQ-FLOW-134, review/147, the lens's round-4 W-1): a file reference is skipped only where the call's
 * own data or field option names it, in the whole-line read, never inside an inline value's text; a JSON string holding
 * a shell expansion makes the whole line read, the raw data option included. Each asking row is red on 6a2e23e0.
 */
describe("the outside-party readers' sixth round (a4c, review/147, the lens's round-4 W-1)", () => {
  const ORIGIN = { ...ON_FEATURE, originRepo: "github.com/acme/app" };
  const rule = (command: string): string | null => {
    const verdict = personOnlyVerdict(command, ORIGIN);
    return verdict.deny ? verdict.rule : null;
  };
  const API = "https://api.github.com/repos/acme/app/issues/1/comments";

  it.each([
    ["an inline body putting a data-option-like word right before a mention", "gh pr comment 3 --body 'run it with -d @alice please'"],
    ["an inline body putting a form-option-like word right before a mention", "gh issue comment 3 --body 'see -F @alice'"],
    ["a heredoc body on stdin putting a data-option-like word before a mention", "gh pr comment 3 --body-file - <<'EOF'\nuse -d @alice\nEOF"],
    ["a JSON body sent with the raw data option, its value from a variable set on the line", `B='@alice look'; curl -X POST --data-raw "{\\"body\\":\\"$B\\"}" ${API}`],
    ["a JSON body joined to the raw data option, its value from a variable set on the line", `B='@alice look'; curl -X POST --data-raw="{\\"body\\":\\"$B\\"}" ${API}`],
  ])("asks for %s", (_, command) => {
    expect(rule(command), command).toBe("outside-write");
  });

  it.each([
    ["a data option's own file beside a body the shell fills in", `T=t; curl -X POST -d @alice.json -d "{\\"title\\":\\"$T\\"}" ${API}`],
    ["a typed field's own file on a gh REST write read whole", "echo x | gh api -X POST repos/acme/app/issues/1/comments -F body=@alice.md --input -"],
    ["a JSON string holding a literal dollar sign and no mention", `curl -X POST --data-raw '{"body":"costs $5"}' ${API}`],
  ])("runs %s", (_, command) => {
    expect(rule(command), command).toBeNull();
  });
});

/**
 * b14b (REQ-FLOW-102, ledger row review/163): a write or a delete of a remote's HEAD ref, where the guard reads the
 * default branch, is read as the push it steers, `push-default`, so it asks. Each asking row is red on d9414a9e, which
 * reads no act there, or for `git remote set-head` the `remote-write` the main thread runs unasked; each pin passes on
 * both.
 */
describe("a remote's HEAD ref written or deleted (b14b, REQ-FLOW-102, review/163)", () => {
  const ORIGIN = { ...ON_FEATURE, originRepo: "github.com/acme/app" };
  /** The acts the default guard runs unasked, a remote write among them (`scripts.ts`'s `RUNS`). */
  const RUNS: PersonOnlyRuleId[] = ["pr-ready", "tag", "workflow-dispatch", "remote-write"];
  /** With the origin known, with the default setting's acts run, and with no origin read (the remote rule's early return). */
  const CONTEXTS = [ORIGIN, { ...ORIGIN, runs: RUNS }, ON_FEATURE] as const;

  it.each([
    ["a symbolic-ref write pointing it at a feature branch", "git symbolic-ref refs/remotes/origin/HEAD refs/remotes/origin/feat/x", "git symbolic-ref"],
    ["a symbolic-ref write naming it without `refs/`", "git symbolic-ref remotes/origin/HEAD refs/remotes/origin/feat/x", "git symbolic-ref"],
    ["a symbolic-ref write with a reason", "git symbolic-ref -m why refs/remotes/origin/HEAD refs/remotes/origin/feat/x", "git symbolic-ref"],
    ["a symbolic-ref write naming it in another case", "git symbolic-ref REFS/REMOTES/ORIGIN/head refs/remotes/origin/feat/x", "git symbolic-ref"],
    ["a symbolic-ref write of another remote's", "git symbolic-ref refs/remotes/upstream/HEAD refs/remotes/upstream/feat/x", "git symbolic-ref"],
    ["a symbolic-ref delete", "git symbolic-ref -d refs/remotes/origin/HEAD", "git symbolic-ref"],
    ["a symbolic-ref delete by the long option", "git symbolic-ref --delete -q refs/remotes/origin/HEAD", "git symbolic-ref"],
    ["an update-ref write", "git update-ref refs/remotes/origin/HEAD 0123abc", "git update-ref"],
    ["an update-ref write that does not follow it", "git update-ref --no-deref refs/remotes/origin/HEAD 0123abc", "git update-ref"],
    ["an update-ref delete", "git update-ref -d refs/remotes/origin/HEAD", "git update-ref"],
    ["an update-ref delete that does not follow it", "git update-ref --no-deref -d refs/remotes/origin/HEAD", "git update-ref"],
    ["an update-ref stdin symref update", "printf 'symref-update refs/remotes/origin/HEAD refs/remotes/origin/feat/x\\n' | git update-ref --stdin", "git update-ref --stdin"],
    ["an update-ref stdin symref create", "printf 'symref-create refs/remotes/origin/HEAD refs/remotes/origin/feat/x\\n' | git update-ref --stdin", "git update-ref --stdin"],
    ["an update-ref stdin symref delete", "printf 'symref-delete refs/remotes/origin/HEAD\\n' | git update-ref --stdin", "git update-ref --stdin"],
    ["an update-ref stdin plain update", "printf 'update refs/remotes/origin/HEAD 0123abc\\n' | git update-ref --stdin", "git update-ref --stdin"],
    ["an update-ref stdin plain delete", "printf 'delete refs/remotes/origin/HEAD\\n' | git update-ref --stdin", "git update-ref --stdin"],
    ["an update-ref stdin text split by NUL", "printf 'symref-update\\0refs/remotes/origin/HEAD\\0refs/remotes/origin/feat/x\\0' | git update-ref -z --stdin", "git update-ref --stdin"],
    ["an update-ref stdin text after another command", "printf 'verify refs/heads/x HEAD\\nupdate refs/remotes/origin/HEAD 0123abc\\n' | git update-ref --stdin", "git update-ref --stdin"],
    ["a remote set-head read from the remote", "git remote set-head origin -a", "git remote set-head"],
    ["a remote set-head read from the remote by the long option", "git remote set-head origin --auto", "git remote set-head"],
    ["a remote set-head naming a branch", "git remote set-head origin feat/x", "git remote set-head"],
    ["a remote set-head delete", "git remote set-head origin -d", "git remote set-head"],
    ["a remote set-head after a global option", "git -C /tmp/repo remote set-head origin --delete", "git remote set-head"],
  ])("asks for %s as a push of the default branch, whatever the origin and the acts run", (_, command, via) => {
    for (const ctx of CONTEXTS) {
      const verdict = personOnlyVerdict(command, ctx);
      expect(verdict, command).toMatchObject({ deny: true, rule: "push-default", ask: true });
      if (verdict.deny) expect(verdict.act, command).toContain(`A remote's HEAD ref written or deleted (\`${via}\`)`);
    }
  });

  it.each([
    ["a symbolic-ref read", "git symbolic-ref refs/remotes/origin/HEAD"],
    ["a short, quiet symbolic-ref read", "git symbolic-ref --short -q refs/remotes/origin/HEAD"],
    ["a symbolic-ref write of HEAD itself", "git symbolic-ref HEAD refs/heads/feat/x"],
    ["a symbolic-ref write of a branch pointed at a remote's HEAD ref", "git symbolic-ref refs/heads/a refs/remotes/origin/HEAD"],
    ["a symbolic-ref write of a remote branch whose name only starts with HEAD", "git symbolic-ref refs/remotes/origin/HEADS refs/remotes/origin/feat/x"],
    ["an update-ref write of a remote branch", "git update-ref refs/remotes/origin/feat/x 0123abc"],
    ["an update-ref stdin text naming only a remote branch", "printf 'update refs/remotes/origin/feat/x 0123abc\\n' | git update-ref --stdin"],
    ["a rev-parse read", "git rev-parse --abbrev-ref origin/HEAD"],
    ["a remote shown", "git remote show origin"],
  ])("reads %s as no act", (_, command) => {
    for (const ctx of CONTEXTS) expect(personOnlyVerdict(command, ctx), command).toEqual({ deny: false });
  });

  // review/24: a remote-tracking branch delete of `<remote>/HEAD` deletes that ref itself.
  it.each([
    ["a remote-tracking delete by short options", "git branch -d -r origin/HEAD"],
    ["a remote-tracking delete in one short cluster, forced", "git branch -Dr origin/HEAD"],
    ["a remote-tracking delete by long options", "git branch --delete --remotes origin/HEAD"],
    ["a remote-tracking delete by abbreviated long options", "git branch --remote --del origin/HEAD"],
    ["a remote-tracking delete in another case", "git branch -r -d origin/head"],
    ["a remote-tracking delete of another remote's, after another name", "git branch -r -d origin/old upstream/HEAD"],
  ])("asks for %s of a remote's HEAD ref as a push of the default branch", (_, command) => {
    for (const ctx of CONTEXTS) {
      const verdict = personOnlyVerdict(command, ctx);
      expect(verdict, command).toMatchObject({ deny: true, rule: "push-default", ask: true });
      if (verdict.deny) expect(verdict.act, command).toContain("A remote's HEAD ref written or deleted (`git branch -d -r`)");
    }
  });

  // review/22, review/26 (the sign-off: fail toward asking): a ref name the line cannot show as literal text, in a line
  // that writes or deletes a ref, may be a remote's HEAD ref.
  it.each([
    ["a symbolic-ref write whose name the shell fills in", 'git symbolic-ref "$R" refs/remotes/origin/feat/x', "git symbolic-ref"],
    ["a symbolic-ref write whose name a substitution gives", "git symbolic-ref $(git rev-parse --symbolic-full-name origin/HEAD) refs/heads/feat/x", "git symbolic-ref"],
    ["a symbolic-ref write whose name is a brace expansion", "git symbolic-ref refs/remotes/origin/{HEAD,x} refs/heads/feat/x", "git symbolic-ref"],
    ["a symbolic-ref delete whose name the shell fills in", 'git symbolic-ref -d "$R"', "git symbolic-ref"],
    ["a symbolic-ref call whose unquoted name may split into a name and a target", "git symbolic-ref $PAIR", "git symbolic-ref"],
    ["a symbolic-ref write after a reason that may split", "git symbolic-ref -m $WHY refs/heads/a refs/heads/feat/x", "git symbolic-ref"],
    ["an update-ref write whose name the shell fills in", 'git update-ref "$R" 0123abc', "git update-ref"],
    ["an update-ref delete whose name a substitution gives", "git update-ref -d `echo refs/remotes/origin/HEAD`", "git update-ref"],
    ["a remote-tracking delete whose name the shell fills in", 'git branch -r -d "$B"', "git branch -d -r"],
    ["a stdin symref update whose name shell quoting splits", "printf 'symref-update refs/remotes/origin/HE''AD refs/heads/feat/x\\n' | git update-ref --stdin", "git update-ref --stdin"],
    ["a stdin symref update whose remote segment shell quoting splits", "printf 'symref-update refs/remotes/ori''gin/HEAD refs/heads/feat/x\\n' | git update-ref --stdin", "git update-ref --stdin"],
    ["a stdin plain delete whose name shell quoting splits", "printf 'delete refs/remotes/origin/HE''AD\\n' | git update-ref --no-deref --stdin", "git update-ref --stdin"],
    ["a stdin symref update whose name a hex escape spells", "printf 'symref-update refs/remotes/origin/HE\\x41D refs/heads/feat/x\\n' | git update-ref --stdin", "git update-ref --stdin"],
    ["a stdin symref update whose name an octal escape spells", "printf 'symref-update refs/remotes/origin/H\\105AD refs/heads/feat/x\\n' | git update-ref --stdin", "git update-ref --stdin"],
    ["a stdin symref update whose name an echo escape spells", "echo -e 'symref-update refs/remotes/origin/HE\\x41D refs/heads/feat/x' | git update-ref --stdin", "git update-ref --stdin"],
    ["a stdin symref update whose name a printf placeholder gives", "printf 'symref-update %s refs/heads/feat/x\\n' \"$R\" | git update-ref --stdin", "git update-ref --stdin"],
    ["a stdin symref update whose name a placeholder ends", "printf 'symref-update %s/HEAD refs/heads/feat/x\\n' refs/remotes/origin | git update-ref --stdin", "git update-ref --stdin"],
    ["a stdin plain delete whose name the shell fills in", 'echo "delete $R" | git update-ref --stdin', "git update-ref --stdin"],
    ["a stdin text whose command word and name shell quoting both split", "printf 'sym''ref-update refs/remotes/origin/HE''AD refs/heads/feat/x\\n' | git update-ref --stdin", "git update-ref --stdin"],
    ["a stdin text the shell fills in whole", 'printf "$TEXT" | git update-ref --stdin', "git update-ref --stdin"],
  ])("asks for %s as a push of the default branch", (_, command, via) => {
    for (const ctx of CONTEXTS) {
      const verdict = personOnlyVerdict(command, ctx);
      expect(verdict, command).toMatchObject({ deny: true, rule: "push-default", ask: true });
      if (verdict.deny) expect(verdict.act, command).toContain(`written or deleted (\`${via}\`)`);
    }
  });

  it.each([
    ["an update-ref write of a local branch from a remote's HEAD ref as its new value", "git update-ref refs/heads/a refs/remotes/origin/HEAD"],
    ["an update-ref write with a reason, from that ref as its new value", "git update-ref -m why refs/heads/a refs/remotes/origin/HEAD"],
    ["an update-ref write checking that ref as its old value", "git update-ref refs/heads/a 0123abc refs/remotes/origin/HEAD"],
    // TEST CHANGE, justified (review/35, the sign-off: close the class): two update-ref rows and the symbolic-ref read
    // of a name the shell fills in moved to the asking rows below, since a word the line cannot show on these calls is
    // read as one that may be any option or that ref.
    ["a stdin update whose literal name is not that ref, its value a placeholder", "printf 'update refs/heads/a %s\\n' \"$SHA\" | git update-ref --stdin"],
    ["a stdin update split by NUL whose literal name is not that ref", "printf 'update\\0refs/heads/a\\0%s\\0' \"$SHA\" | git update-ref -z --stdin"],
    ["a stdin update whose literal name ends at a space escape", "printf 'update\\x20refs/heads/a\\x200123abc\\n' | git update-ref --stdin"],
    ["a stdin verify of a symref", "printf 'symref-verify refs/heads/a refs/heads/main\\n' | git update-ref --stdin"],
    ["a remote-tracking delete of a remote branch", "git branch -r -d origin/feat/x"],
    ["a local branch delete whose name is a remote's HEAD ref", "git branch -D origin/HEAD"],
    ["a remote-tracking branch list", "git branch -r"],
    // review/35: one quoted word the shell fills in on a git branch call stands for one word, so it cannot be both the
    // missing flags and that ref's name.
    ["a local branch delete whose one name the shell fills in", 'git branch -D "$B"'],
    ["a branch created under a name the shell fills in", 'git branch "$NEW"'],
    ["a branch created under a name the shell fills in, from a literal start point", 'git branch "$NEW" feat/x'],
    ["an update-ref stdin text read under a literal option that is no prefix of it", "printf 'update refs/remotes/origin/feat/x 0123abc\\n' | git update-ref --stdin -z"],
    // review/51: a word the shell fills in after a shown `git remote` subcommand, and a fully literal line, keep their
    // verdict; git refuses a literal empty subcommand.
    ["a remote read of a name the shell fills in, after a shown subcommand", 'git remote get-url "$R"'],
    ["a remote call whose subcommand is a literal empty word", 'git remote "" set-head origin -a'],
  ])("reads %s as no act", (_, command) => {
    for (const ctx of CONTEXTS) expect(personOnlyVerdict(command, ctx), command).toEqual({ deny: false });
  });

  // review/35 (the sign-off: close the class, not each spelling): on these calls, any word the line cannot show as
  // literal text, an option word or a name, may be the delete, remotes or `--stdin` flag or that ref, and a unique
  // prefix of a long option is read as that option, as git reads it. Each row but the last two is red on fff9c815.
  it.each([
    ["a symbolic-ref call of that ref after a dash word the shell fills in", 'git symbolic-ref -"$O" refs/remotes/origin/HEAD', "A remote's HEAD ref written or deleted (`git symbolic-ref`)"],
    ["a symbolic-ref call of that ref after a quoted reason the shell fills in", 'git symbolic-ref -m "$WHY" refs/remotes/origin/HEAD', "A remote's HEAD ref written or deleted (`git symbolic-ref`)"],
    ["a symbolic-ref read of a name the shell fills in", 'git symbolic-ref "$R"', "may be a remote's HEAD ref, written or deleted (`git symbolic-ref`)"],
    ["an update-ref stdin text under an abbreviated stdin option", "printf 'update refs/remotes/origin/HEAD 0123abc\\n' | git update-ref --std", "A remote's HEAD ref written or deleted (`git update-ref --stdin`)"],
    ["an update-ref stdin symref text under the shortest prefix of the stdin option", "printf 'symref-update refs/remotes/origin/HEAD refs/heads/feat/x\\n' | git update-ref --s", "A remote's HEAD ref written or deleted (`git update-ref --stdin`)"],
    ["an update-ref stdin text whose name quoting splits, under an abbreviated stdin option", "printf 'delete refs/remotes/origin/HE''AD\\n' | git update-ref --stdi", "written or deleted (`git update-ref --stdin`)"],
    ["an update-ref call whose only option is a dash word the shell fills in", "printf 'symref-delete refs/remotes/origin/HEAD\\n' | git update-ref -\"$O\"", "may be a remote's HEAD ref, written or deleted (`git update-ref`)"],
    ["an update-ref write whose literal name is not that ref, its value filled in", 'git update-ref refs/heads/a "$SHA"', "may be a remote's HEAD ref, written or deleted (`git update-ref`)"],
    ["an update-ref write whose literal name follows a quoted reason the shell fills in", 'git update-ref -m "$WHY" refs/heads/a 0123abc', "may be a remote's HEAD ref, written or deleted (`git update-ref`)"],
    ["a remote-tracking delete of that ref whose remotes flag the shell fills in", 'git branch -d "$F" origin/HEAD', "may be a remote's HEAD ref, written or deleted (`git branch -d -r`)"],
    ["a remote-tracking delete of that ref whose delete flag is a dash word the shell fills in", 'git branch -"$F" -r origin/HEAD', "may be a remote's HEAD ref, written or deleted (`git branch -d -r`)"],
    ["a branch call of that ref whose one flag word the shell fills in", 'git branch "$F" origin/HEAD', "may be a remote's HEAD ref, written or deleted (`git branch -d -r`)"],
    ["a branch delete whose unquoted name may split into a remotes flag and that ref", "git branch -D $B", "may be a remote's HEAD ref, written or deleted (`git branch -d -r`)"],
    ["a branch call whose unquoted word may split into every part", "git branch $ARGS", "may be a remote's HEAD ref, written or deleted (`git branch -d -r`)"],
    // Pins, asking on fff9c815 too: a quoted word the shell fills in where an update-ref ref stands, and both flags shown.
    ["an update-ref call whose first word is an option the shell fills in whole", "printf 'delete refs/remotes/origin/HEAD\\n' | git update-ref \"$O\"", "may be a remote's HEAD ref, written or deleted (`git update-ref`)"],
    ["a remote-tracking delete by both flags whose name the shell fills in", 'git branch -dr "$B"', "may be a remote's HEAD ref, written or deleted (`git branch -d -r`)"],
  ])("asks for %s as a push of the default branch", (_, command, act) => {
    for (const ctx of CONTEXTS) {
      const verdict = personOnlyVerdict(command, ctx);
      expect(verdict, command).toMatchObject({ deny: true, rule: "push-default", ask: true });
      if (verdict.deny) expect(verdict.act, command).toContain(act);
    }
  });

  // review/51 (the sign-off: round 2's class rule on this route too): on a `git remote` call, a word the line cannot
  // show at or before the subcommand's place may be an option, vanish, or be `set-head` itself, as git 2.52 runs each
  // spelling, so the call may write that ref. Each row is red on e54aa59c, which reads it as no act.
  it.each([
    ["a remote set-head after a quoted word the shell fills in", 'git remote "$X" set-head origin feat/x'],
    ["a remote set-head after an unquoted word the shell fills in, which may vanish", "git remote $X set-head origin -a"],
    ["a remote set-head after a command substitution", "git remote $(echo -v) set-head origin -d"],
    ["a remote set-head after a glob", "git remote * set-head origin feat/x"],
    ["a remote set-head after a brace expansion", "git remote {-v,} set-head origin feat/x"],
    ["a remote set-head after a literal option and a word the shell fills in", 'git remote -v "$X" set-head origin -a'],
    ["a remote set-head after a global option and a word the shell fills in", 'git -C /tmp/repo remote "$X" set-head origin --delete'],
    ["a remote call whose subcommand the shell fills in", 'git remote "$SUB" origin feat/x'],
    ["a remote call whose unquoted word may split into the whole call", "git remote $ARGS"],
    ["a remote call whose unquoted dash word may split into an option and the subcommand", "git remote -$X origin feat/x"],
  ])("asks for %s as a push of the default branch", (_, command) => {
    for (const ctx of CONTEXTS) {
      const verdict = personOnlyVerdict(command, ctx);
      expect(verdict, command).toMatchObject({ deny: true, rule: "push-default", ask: true });
      if (verdict.deny) expect(verdict.act, command).toContain("may be a remote's HEAD ref, written or deleted (`git remote set-head`)");
    }
  });

  // review/36: each reader of these calls is linear in the line's length, so a line at the 64 KiB cap, built to the
  // worst class each reader has, decides well inside the hook's timeout. The stdin rows took 5 to 37 s on fff9c815, the
  // remote-tracking delete 7 s, and the symref text under many calls 0.9 s; each is under 0.1 s here.
  it.each([
    ["a stdin text of one long run of remote-tracking prefixes", () => `printf '${"remotes/".repeat(8_187)}' | git update-ref --stdin`, null],
    ["many stdin calls, then one long run of remote-tracking prefixes", () => `${"git update-ref --stdin;".repeat(10)}printf '${"remotes/".repeat(8_160)}'`, null],
    ["many stdin calls over one text", () => "git update-ref --stdin;".repeat(2_849), null],
    ["many stdin calls over many symref deletes of that ref", () => `${"git update-ref --stdin;".repeat(1_365)}${"symref-delete remotes/o/HEAD ".repeat(1_160)}`, "push-default"],
    ["a remote-tracking delete of many names", () => `git branch -d -r ${"a ".repeat(32_750)}`, null],
    ["a symbolic-ref call of many words", () => `git symbolic-ref ${"a ".repeat(32_750)}`, null],
    ["an update-ref call of many words the shell fills in", () => `git update-ref ${'"$a" '.repeat(13_100)}`, "push-default"],
  ])("decides %s at the cap in under a second", (_, build, rule) => {
    const command = build();
    expect(command.length).toBeLessThanOrEqual(65_536);
    expect(command.length).toBeGreaterThan(65_000);
    const started = performance.now();
    const verdict = personOnlyVerdict(command, ORIGIN);
    expect(performance.now() - started).toBeLessThan(1_000);
    expect(verdict).toMatchObject(rule === null ? { deny: false } : { deny: true, rule, ask: true });
  });

  it("keeps the other remote writes `remote-write`, which the setting runs unasked", () => {
    // review/51: a word the shell fills in after a shown subcommand leaves the call that write alone.
    for (const command of ["git remote set-url origin https://github.com/other/repo.git", "git remote rename origin old", "git remote remove origin", 'git remote add "$NAME" "$URL"']) {
      expect(personOnlyVerdict(command, { ...ORIGIN, runs: RUNS }), command).toEqual({ deny: false, runs: ["remote-write"] });
      expect(personOnlyVerdict(command, ORIGIN), command).toMatchObject({ deny: true, rule: "remote-write", ask: true });
    }
  });

  it("keeps a tag's own act beside it, a refuse-class one deciding the line", () => {
    const write = "git symbolic-ref refs/remotes/origin/HEAD refs/remotes/origin/feat/x";
    // The tag runs unasked, so the HEAD ref write still asks; a tag deletion refuses the line.
    expect(personOnlyVerdict(`git tag v2 && ${write}`, { ...ORIGIN, runs: RUNS })).toMatchObject({ deny: true, rule: "push-default", ask: true });
    expect(personOnlyVerdict(`git tag -d v1 && ${write}`, { ...ORIGIN, runs: RUNS })).toMatchObject({ deny: true, rule: "tag-delete", ask: false });
    expect(personOnlyVerdict("git update-ref refs/tags/v2 HEAD && git update-ref refs/remotes/origin/HEAD 0123abc", { ...ORIGIN, runs: RUNS })).toMatchObject({
      deny: true,
      rule: "push-default",
      ask: true,
    });
    const text = "printf 'delete refs/tags/v1\\nupdate refs/remotes/origin/HEAD 0123abc\\n' | git update-ref --stdin";
    expect(personOnlyVerdict(text, { ...ORIGIN, runs: RUNS })).toMatchObject({ deny: true, rule: "tag-delete", ask: false });
  });

  it("names a deploying target first, as a push onto a deploying branch is named before the default branch", () => {
    const deploying = { ...ORIGIN, deployingBranches: ["production"] };
    expect(personOnlyVerdict("git symbolic-ref refs/remotes/origin/HEAD refs/heads/production", deploying)).toMatchObject({ deny: true, rule: "push-deploying", ask: true });
    expect(personOnlyVerdict("git symbolic-ref refs/remotes/origin/HEAD refs/heads/feat/x", deploying)).toMatchObject({ deny: true, rule: "push-default", ask: true });
  });

  it("names a deploying target first on the stdin symref spelling and on a remote set-head (review/25)", () => {
    const deploying = { ...ORIGIN, deployingBranches: ["production"] };
    for (const command of [
      "printf 'symref-update refs/remotes/origin/HEAD refs/heads/production\\n' | git update-ref --stdin",
      "git remote set-head origin production",
      // A branch the line cannot show may be a deploying one.
      'git remote set-head origin "$B"',
      // A word the line cannot show before the subcommand leaves the branch one it cannot show too (review/51).
      'git remote "$X" set-head origin feat/x',
    ]) {
      expect(personOnlyVerdict(command, deploying), command).toMatchObject({ deny: true, rule: "push-deploying", ask: true });
    }
    expect(personOnlyVerdict("git remote set-head origin feat/x", deploying)).toMatchObject({ deny: true, rule: "push-default", ask: true });
    expect(personOnlyVerdict("git remote set-head origin -a", deploying)).toMatchObject({ deny: true, rule: "push-default", ask: true });
  });

  it("reads no act on the run verbs' own lines, whose write of origin's HEAD ref goes through the CLI's git runner", () => {
    // `alignOriginHead` (src/cli/commands/run.ts) writes the ref from the verb's process, never as a line the agent
    // types, so the line the guard judges is the verb's alone, the one simple command `verbShape` admits.
    for (const command of ["npx --no stamity run start --run x", "stamity run checkpoint --run x --pr --title t", "npx -y stamity run end --run x"]) {
      // The unattended rule admits each as the verb alone on its line, so these are the lines a run types.
      expect(unattendedPushVerdict(command), command).toEqual({ deny: false });
      for (const ctx of CONTEXTS) expect(personOnlyVerdict(command, ctx), command).toEqual({ deny: false });
    }
  });
});
