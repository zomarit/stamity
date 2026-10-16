import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CLAUDE_DENY_ROWS,
  PERSON_ONLY_RULES,
  personOnlyVerdict,
  unattendedPushVerdict,
} from "../../src/hooks/personOnly.ts";

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
  // The run verb's push argv (u4's gitWrite hardening + u18b's push), joined as u18b checks it.
  [
    "git -c safe.bareRepository=explicit -c core.fsmonitor=false -c push.followTags=false push origin HEAD:refs/heads/stamity/2026-10-16_x",
    { defaultBranches: ["main"], currentBranch: "stamity/2026-10-16_x", tags: ["v1.0.0"] },
  ],
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
  ])("allows %j", (command) => {
    expect(personOnlyVerdict(command, ON_MAIN)).toEqual({ deny: false });
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
  ])("allows %j", (command) => {
    expect(unattendedPushVerdict(command)).toEqual({ deny: false });
  });
});

describe("CLAUDE_DENY_ROWS", () => {
  it("is a list of Claude Code prefix rules", () => {
    expect(CLAUDE_DENY_ROWS.length).toBeGreaterThan(10);
    for (const row of CLAUDE_DENY_ROWS) expect(row).toMatch(/^Bash\([^()]+:\*\)$/);
    expect(new Set(CLAUDE_DENY_ROWS).size).toBe(CLAUDE_DENY_ROWS.length);
  });

  it("holds only prefixes the shell guard also denies, so the two layers agree", () => {
    for (const row of CLAUDE_DENY_ROWS) {
      const prefix = row.slice("Bash(".length, -":*)".length);
      expect(personOnlyVerdict(prefix, ON_FEATURE), row).toMatchObject({ deny: true });
    }
  });

  it("reaches every rule a prefix can express", () => {
    const rules = new Set(
      CLAUDE_DENY_ROWS.map((row) => {
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
    for (const row of CLAUDE_DENY_ROWS) {
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
