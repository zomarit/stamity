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
  // push-delete
  ["git push origin --delete feat/x", "push-delete"],
  ["git push -d origin feat/x", "push-delete"],
  ["git push origin :feat/x", "push-delete"],
  ["git push origin :refs/heads/feat/x", "push-delete"],
  ["git push --prune origin", "push-delete"],
  // tag
  ["git tag v1.0.0", "tag"],
  ["git tag -a v1.0.0 -m release", "tag"],
  ["git tag -s v1.0.0", "tag"],
  ["git tag -d v1.0.0", "tag"],
  ["git tag -f v1.0.0 HEAD", "tag"],
  ["git tag --delete v1.0.0", "tag"],
  ["git tag -l -d v1.0.0", "tag"],
  // pr-merge, pr-ready
  ["gh pr merge 3 --squash", "pr-merge"],
  ["gh pr merge --auto --squash", "pr-merge"],
  ["gh pr --repo o/r merge 3", "pr-merge"],
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
  ["pnpm publish", "publish"],
  ["yarn publish", "publish"],
  ["yarn npm publish", "publish"],
  ["bun publish", "publish"],
  ["bun publish --access public", "publish"],
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
  // REST respellings of a push
  ["gh api -X PATCH repos/o/r/git/refs/heads/main -f sha=abc", "push-default"],
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
  ["gh repo view o/r"],
  ["gh repo edit --description 'x'"],
  ["gh repo clone o/r"],
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
    ["gh pr create --draft --title t --body-file b.md"],
    ["gh pr edit 3 --body-file b.md"],
    ["gh repo sync"],
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
    ["git fetch origin"],
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
