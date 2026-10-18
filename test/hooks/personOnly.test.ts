import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CLAUDE_DENY_ROWS,
  PERSON_ONLY_RULES,
  personOnlyVerdict,
  unattendedPushVerdict,
} from "../../src/hooks/personOnly.ts";
import { CURATED_MCP_SERVERS, PLATFORM_MCP_SERVER } from "../../src/mcp/catalog.ts";

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

type Ctx = { defaultBranches: readonly string[]; currentBranch: string | null; tags: readonly string[] };

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
  ["gh api graphql -f query='mutation($u: [RefUpdate!]!) { updateRefs(input: {repositoryId: \"R\", refUpdates: $u}) { clientMutationId } }'", "push-default"],
  ["gh api graphql -f query='mutation { updateRef(input: {refId: \"x\", oid: \"abc\"}) { clientMutationId } }'", "push-default"],
  // A batch element given whole as a variable, beside a literal feature-branch element, in either order (review/128).
  [
    "gh api graphql -f query='mutation($u: RefUpdate!) { updateRefs(input: {repositoryId: \"R\", refUpdates: [$u, {name: \"refs/heads/feat/x\", afterOid: \"a\"}]}) { clientMutationId } }'",
    "push-default",
  ],
  [
    "gh api graphql -f query='mutation($u: RefUpdate!) { updateRefs(input: {repositoryId: \"R\", refUpdates: [{name: \"refs/heads/feat/x\", afterOid: \"a\"}, $u]}) { clientMutationId } }'",
    "push-default",
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
  ["git push --mirror", "push-tags"],
  ["git push --all origin", "push-tags"],
  // Named forms the table holds, each pinned (review/110).
  ["git push --branches origin", "push-tags"],
  ["git -c remote.origin.mirror=true push origin", "push-tags"],
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
  ["git tag -d v1.0.0", "tag"],
  ["git tag -f v1.0.0 HEAD", "tag"],
  ["git tag --delete v1.0.0", "tag"],
  ["git tag -l -d v1.0.0", "tag"],
  ["git-tag v1.0.0", "tag"],
  // A tag ref written through `git update-ref` (pr/53): created, deleted, and named in a piped `--stdin` text.
  ["git update-ref refs/tags/v1 HEAD", "tag"],
  ["git update-ref -d refs/tags/v1", "tag"],
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
  ["gh release delete v1.0.0 --yes", "release"],
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
  ["gh secret set TOKEN --body x", "secrets"],
  ["gh secret delete TOKEN", "secrets"],
  ["gh variable set NAME --body x", "secrets"],
  ["gh variable delete NAME", "secrets"],
  ["gh api -X PUT repos/o/r/actions/secrets/TOKEN -f encrypted_value=x", "secrets"],
  ["gh api -X DELETE repos/o/r/actions/variables/NAME", "secrets"],
  ["gh api repos/o/r/actions/variables -f name=N -f value=v", "secrets"],
  ["gh api -X PUT repos/o/r/environments/prod/secrets/TOKEN", "secrets"],
  // protection
  ["gh api -X PUT repos/o/r/branches/main/protection --input p.json", "protection"],
  ["gh api -X DELETE repos/o/r/branches/main/protection", "protection"],
  ["gh api -X POST repos/o/r/rulesets --input r.json", "protection"],
  ["gh api -X DELETE repos/o/r/rulesets/7", "protection"],
  ["curl -X PUT https://api.github.com/repos/o/r/branches/release/v2/protection", "protection"],
  // the repository itself: its default branch, deleting or archiving it
  ["gh repo edit --default-branch trunk", "protection"],
  ["gh repo edit o/r --default-branch=trunk", "protection"],
  ["gh repo delete o/r --yes", "protection"],
  ["gh repo archive o/r --yes", "protection"],
  // Its visibility and name, and the REST twins on the repository's own path (review/69, build/31).
  ["gh repo edit --visibility public --accept-visibility-change-consequences", "protection"],
  ["gh repo edit o/r --visibility=private", "protection"],
  ["gh repo rename new-name", "protection"],
  ["gh repo rename new-name -R o/r --yes", "protection"],
  ["gh api -X PATCH repos/o/r -f default_branch=x", "protection"],
  ["gh api -X PATCH /repos/o/r/ -f private=false", "protection"],
  ["gh api -X DELETE repos/o/r", "protection"],
  ["curl -X PATCH -d '{\"visibility\":\"public\"}' https://api.github.com/repos/o/r", "protection"],
  ["gh api -X PATCH repositories/123 -f archived=true", "protection"],
  // The branch-rename endpoint (the 23:20Z sign-off with review/60).
  ["gh api -X POST repos/o/r/branches/main/rename -f new_name=trunk", "protection"],
  ["gh api repos/o/r/branches/feat/x/rename -f new_name=y", "protection"],
  // A repository transfer (the 23:34Z sign-off): the REST form and a gh CLI form.
  ["gh api -X POST repos/o/r/transfer -f new_owner=other", "protection"],
  ["gh api repos/o/r/transfer -f new_owner=other", "protection"],
  ["curl -X POST -d '{\"new_owner\":\"other\"}' https://api.github.com/repos/o/r/transfer", "protection"],
  ["gh api -X POST repositories/123/transfer -f new_owner=other", "protection"],
  ["gh repo transfer o/r other --yes", "protection"],
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
  ["git push --mir", "push-tags"],
  ["git push --follow-t origin feat/x", "push-tags"],
  ["git push --rep=origin main", "push-default"],
  ["git push --push-o ci.skip origin", "push-default", ON_MAIN],
  // The Windows command interpreter's caret escape (pr/10), in an option and in the program word.
  ["cmd /c git push --for^ce origin feat/x", "force-push"],
  ["cmd /c git push --del^ete origin feat/x", "push-delete"],
  ["cmd /c g^it push --force origin feat/x", "force-push"],
  // wget's method and body options as the unique prefixes wget reads (pr/11).
  ["wget --meth=DELETE https://api.github.com/repos/o/r/git/refs/heads/feat/x", "push-delete"],
  ["wget --meth DELETE https://api.github.com/repos/o/r/releases/1", "release"],
  ["wget --post-d '{\"event\":\"APPROVE\"}' https://api.github.com/repos/o/r/pulls/3/reviews", "pr-merge"],
  ["wget --body-f=r.json --meth=POST https://api.github.com/repos/o/r/pulls/3/reviews", "pr-merge"],
  // The two-letter prefix, `--method` where wget has no metalink options (pr/29).
  ["wget --me DELETE https://api.github.com/repos/o/r/git/refs/heads/feat/x", "push-delete"],
  // wget's `-e`/`--execute` run as wgetrc commands (pr/23): `method` sets the method, the body commands send a body.
  ["wget -e method=DELETE https://api.github.com/repos/o/r/git/refs/heads/feat/x", "push-delete"],
  ["wget --execute=method=DELETE https://api.github.com/repos/o/r/releases/1", "release"],
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
  ["git symbolic-ref -d refs/tags/v9", "tag"],
  ["git symbolic-ref --delete -q refs/tags/v9", "tag"],
  ["git symbolic-ref -qd refs/tags/v9", "tag"],
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
  ].map((name) => [`gh api graphql -f query='mutation { ${name}(input: {repositoryId: "R"}) { clientMutationId } }'`, "protection"] as const),
  [
    "curl -X POST -d '{\"query\":\"mutation { archiveRepository(input: {repositoryId: \\\"R\\\"}) { clientMutationId } }\"}' https://api.github.com/graphql",
    "protection",
  ],
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
  ["gh repo edit --description 'x'"],
  ["gh repo clone o/r"],
  ["gh repo edit --description 'x' --homepage https://x.dev"],
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
  // review/128's twin: literal elements only, one of them with a variable object id.
  [
    "gh api graphql -f query='mutation($o: GitObjectID!) { updateRefs(input: {repositoryId: \"R\", refUpdates: [{name: \"refs/heads/feat/x\", afterOid: $o}, {name: \"refs/heads/feat/y\", afterOid: \"b\"}]}) { clientMutationId } }'",
  ],
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
  // A curl write whose glob is switched off, judged as the literal path it sends; a glob or an IPv6 host on a read; a
  // plain read; wget's input file on a read (pr/76, pr/77).
  ["curl -X PATCH -d '{\"sha\":\"abc\"}' --globoff 'https://api.github.com/repos/o/r/git/refs/heads/{feature,main}'"],
  ["curl -sg -X PATCH -d '{\"sha\":\"abc\"}' 'https://api.github.com/repos/o/r/git/refs/heads/{feature,main}'"],
  ["curl 'https://example.com/p[1-3].html'"],
  ["curl 'http://[::1]:3000/health'"],
  ["curl https://api.github.com/repos/o/r"],
  ["wget -i urls.txt"],
  ["wget -qi urls.txt"],
];

describe("personOnlyVerdict — the deny matrix", () => {
  it.each(DENY.map(([command, rule, ctx]) => ({ command, rule, ctx })))("denies $command as $rule", ({ command, rule, ctx }) => {
    const verdict = personOnlyVerdict(command, ctx ?? ON_FEATURE);
    expect(verdict).toMatchObject({ deny: true, rule });
    if (verdict.deny) expect(verdict.reason).toContain(rule);
  });

  it.each(ALLOW.map(([command, ctx]) => ({ command, ctx })))("allows $command", ({ command, ctx }) => {
    expect(personOnlyVerdict(command, ctx ?? ON_FEATURE)).toEqual({ deny: false });
  });

  it("covers every rule id in the table, and names no rule outside it", () => {
    const ids = new Set(PERSON_ONLY_RULES.map((rule) => rule.id));
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
    ]);
    const hit = new Set(DENY.map(([, rule]) => rule));
    expect(hit).toEqual(ids);
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
    ["sh -c \"$(printf '%s' 'git pu' 'sh -f')\""],
    ["sh -c \"$(echo Z2l0IHB1c2ggLWY= | base64 -d)\""],
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

describe("an HTTP call whose method or target the line cannot show (pr/73, pr/76, pr/77)", () => {
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
  ])("throws a coded HTTP_TARGET_HIDDEN for %j in both verdicts, so the guard refuses it", (command) => {
    expect(thrown(() => personOnlyVerdict(command, ON_FEATURE))).toBe("HTTP_TARGET_HIDDEN");
    expect(thrown(() => unattendedPushVerdict(command))).toBe("HTTP_TARGET_HIDDEN");
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
    ["env -u GIT_EXEC_PATH npx --no stamity run end --run x"],
    ["GIT_TERMINAL_PROMPT=0 npx --no stamity run end --run x"],
    ["export GIT_TRACE=1; npx --no stamity run end --run x"],
    ["Get-Item env:GIT_EXEC_PATH; npm test"],
    ["$env:GIT_EXEC_PATH; npm test"],
    ["${env:GIT_CONFIG_NOSYSTEM}='1'; npx --no stamity run end --run x"],
    ["Set-Item env:GIT_CONFIG_NOSYSTEM 1; npm test"],
    // review/243's twins: a `declare` that prints one, exports a variable outside the set, or gives one an attribute
    // other than `x`.
    ["declare -p GIT_EXEC_PATH; npx --no stamity run end --run x"],
    ["declare -x GIT_TERMINAL_PROMPT; npx --no stamity run end --run x"],
    ["typeset -i GIT_CONFIG_COUNT; npm test"],
    // review/247's twins: a name outside the set read, one only read from (not assigned), allexport turned off and a
    // `set` cluster with no `a` on a line naming one, and one named as `for`'s word or `printf`'s argument, no name.
    ["read OTHER_NAME <<< /tmp/bin; npx --no stamity run end --run x"],
    ["echo \"$GIT_EXEC_PATH\"; npx --no stamity run end --run x"],
    ["set +a; read OTHER_NAME <<< \"$GIT_EXEC_PATH\"; npx --no stamity run end --run x"],
    ["set -e; echo \"$GIT_EXEC_PATH\"; npx --no stamity run end --run x"],
    ["for f in GIT_EXEC_PATH GIT_EDITOR; do grep -rn \"$f\" src; done; npm test"],
    ["printf '%s\\n' GIT_EXEC_PATH; npx --no stamity run end --run x"],
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
  ])("allows %j", (command) => {
    expect(unattendedPushVerdict(command)).toEqual({ deny: false });
  });
});

describe("CLAUDE_DENY_ROWS", () => {
  /** The prefix rows the shell guard's verdict reads, and the MCP tool rows no shell verdict sees (review/214). */
  const BASH_ROWS = CLAUDE_DENY_ROWS.filter((row) => row.startsWith("Bash("));
  const MCP_ROWS = CLAUDE_DENY_ROWS.filter((row) => !row.startsWith("Bash("));

  it("is a list of Claude Code prefix rules, then the GitHub MCP server's write tools by name", () => {
    expect(BASH_ROWS.length).toBeGreaterThan(10);
    for (const row of BASH_ROWS) expect(row).toMatch(/^Bash\([^()]+:\*\)$/);
    expect(new Set(CLAUDE_DENY_ROWS).size).toBe(CLAUDE_DENY_ROWS.length);
    // Claude Code's MCP permission-rule form, `mcp__<server>__<tool>`: the server's merge and branch-write tools, one
    // row each, after every prefix row (review/214, the 03:12Z sign-off), then its review-submit, pull-request-update,
    // branch-create and repository-delete tools (review/226, the 04:01Z and 04:05Z sign-offs).
    expect(MCP_ROWS).toEqual([
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
      "mcp__github__delete_repository",
      // pr/78: a pull request opened as a tool call skips the run verbs' draft and their title and body screen; the row
      // cannot read the mode, so it refuses attended sessions too, where `gh pr create` through the shell is the route.
      "mcp__github__create_pull_request",
    ]);
    expect(CLAUDE_DENY_ROWS.slice(BASH_ROWS.length)).toEqual(MCP_ROWS);
  });

  it("names the GitHub MCP server by the key the engine writes it under", () => {
    // A row naming another server would match no tool the client surfaces: the key is the platform server's catalog id.
    expect(PLATFORM_MCP_SERVER.github).toBe("github");
    expect(CURATED_MCP_SERVERS.github?.id).toBe("github");
    for (const row of MCP_ROWS) expect(row.split("__")[1]).toBe(PLATFORM_MCP_SERVER.github);
  });

  it("holds only prefixes the shell guard also denies, so the two layers agree", () => {
    for (const row of BASH_ROWS) {
      const prefix = row.slice("Bash(".length, -":*)".length);
      expect(personOnlyVerdict(prefix, ON_FEATURE), row).toMatchObject({ deny: true });
    }
  });

  it("reaches every rule a prefix can express", () => {
    const rules = new Set(
      BASH_ROWS.map((row) => {
        const verdict = personOnlyVerdict(row.slice("Bash(".length, -":*)".length), ON_FEATURE);
        return verdict.deny ? verdict.rule : "none";
      }),
    );
    // `push-default` has no row: a prefix ending in a branch name over-matches a longer one (see below).
    expect([...rules].toSorted()).toEqual(
      PERSON_ONLY_RULES.map((rule) => rule.id)
        .filter((id) => id !== "push-default")
        .toSorted(),
    );
  });

  it("holds no row whose prefix, read as a raw string, also refuses an allowed command", () => {
    // If Claude Code's `:*` matched a raw string prefix rather than at a word boundary, `Bash(git push origin
    // main:*)` would refuse `git push origin main-feature` in an attended session; no row may prefix an allowed line.
    const allowed = [
      ...ALLOW.map(([command]) => command),
      "git push origin main-feature",
      "git push origin master-x",
      "git push origin HEAD:main-feature",
      "git push origin HEAD:refs/heads/master-x",
      "git push -u origin main-feature",
    ];
    for (const row of BASH_ROWS) {
      const prefix = row.slice("Bash(".length, -":*)".length);
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
    expect(unattended("git push origin HEAD:refs/heads/x").deny).toBe(true);
    expect(unattended("gh api repos/o/r/pulls/3/comments -F body=@reply.md")).toEqual({ deny: false });
  });
});
