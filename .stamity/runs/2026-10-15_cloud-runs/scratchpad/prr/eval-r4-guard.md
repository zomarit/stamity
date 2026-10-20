**status: DONE.** All seven claims hold at HEAD `558b1200`: the guard returns `{ deny: false }` for each form as described. None of the forms is named as a residual in `SECURITY.md`, in the module comment (`src/hooks/personOnly.ts:29-41`) or in the allowed-residual tests (`test/hooks/personOnly.test.ts:820-843`). Only J1 is covered unattended, because every raw `git push` is refused there. All seven are ACCEPT, all Warning.

Each confidence line has two halves. The guard's verdict is traced from code and rated high, `direct`. Whether curl, wget, git or GitHub actually perform the act was not reproduced at the `codebase` tier. That half rests on the reviewer's reported runs, the docs they cite and my own knowledge, so it is rated medium, `unverified`.

---

### J1: symbolic refs and the push destination

- **decision:** ACCEPT
- **severity:** Warning. It is attended only: unattended, every raw push is refused (`personOnly.ts:1903`), and the remote's protection is the backstop, the same stance as the accepted residual at `SECURITY.md:417-421`.
- **confidence:** guard half high, `direct`. That git resolves a symbolic source when the destination is left out: medium, `inferred`. The guard's own `HEAD` rule (`personOnly.ts:817`) encodes the same dereference for `HEAD`, which is itself a symbolic ref, and git's `match_explicit` resolution is recalled, not located.
- **applicability:** current
- **evidence:**
  - The dispatcher (`personOnly.ts:1185-1207`) has no `symbolic-ref` branch.
  - `destination()` returns the literal source (`:733-739`), and the per-refspec checks compare only that literal name (`:813-819`).
  - Unattended, `symbolic-ref` passes as a builtin (`:1770`, `:1945`).
  - The guard reads `HEAD`, `origin/HEAD` and the tags from disk before the line runs (`src/hooks/scripts.ts:3594-3608`, `:3756-3760`).
  - Writing a tag ref is refused for `git update-ref` (`personOnly.ts:1195-1201`) but not for `git symbolic-ref refs/tags/…`.
- **causal_chain:**
  1. `git symbolic-ref refs/heads/safe refs/heads/main` passes: nothing reads `symbolic-ref`.
  2. `git push origin safe` reaches `pushVerdict`, and the name `safe` is not a default branch (`:816`).
  3. git sends `refs/heads/main` as the destination, so the remote `main` moves while the verdict says allowed.
  4. Separately, `git symbolic-ref refs/tags/v9 …` creates a local tag, which the `tag` rule exists to refuse.
- **smallest_fix:** Add a `sub === "symbolic-ref"` branch to the dispatcher in `personOnlyVerdict`:
  - A write whose name is under `refs/tags/`, or `-d`/`--delete` on one, is denied as `tag`.
  - A write under `refs/heads/` whose target is `refs/heads/<default>`, or a target the line cannot show (`$`/backtick), is denied as `push-default`.
  - Reads and writes of `HEAD` stay allowed.
- **test_rows:**
  - Deny `git symbolic-ref refs/heads/safe refs/heads/main && git push origin safe` (push-default).
  - Deny `git symbolic-ref refs/tags/v9 refs/heads/feat/x` and `git symbolic-ref -d refs/tags/v9` (tag).
  - Allow `git symbolic-ref HEAD`, `git symbolic-ref --short -q HEAD` and `git symbolic-ref refs/heads/a refs/heads/feat/x`.
- **design_note:**
  - **Reading the `symbolic-ref` write is the smaller fix, and the only one that catches the reviewer's own example.** Resolving at push time cannot catch it: the guard reads refs before the line runs (`scripts.ts:3594-3608`), so a symbolic ref created earlier on the same line does not exist yet when the push is judged.
  - **What reading the write misses:** a symbolic ref that already exists on disk, written by a shell redirect (the reading drops redirections, `personOnly.ts:406-413`), by the Write tool, or by the person.
  - **The fail-closed completion** is a lazy `symrefs` read on the context, built like `tags` (`scripts.ts:3599-3607`) from loose `refs/heads/**` files through `gitText`, which already refuses links and oversized files (`:3198-3204`). That changes `PersonOnlyContext`; make the field optional (see the breaking-change block). A reftable repository reads no loose refs, so there that route stays a residual to name in `SECURITY.md`.
  - **Sibling gap, outside the seven findings:** `git switch main && git push origin HEAD`, or a bare `git push` after it, is judged against the branch read before the line runs (`personOnly.ts:718`, `:817`, `:833`), so it passes. This is `inferred`, traced from code and not run.

### J3: curl `--next`

- **decision:** ACCEPT
- **severity:** Warning
- **confidence:** guard half high, `direct`. That `--next` resets `-X` per request: medium, `unverified` (curl manpage cited by the reviewer, not read here).
- **applicability:** current
- **evidence:**
  - Each `-X` overwrites `method` (`personOnly.ts:664-670`).
  - `--next` and its short form `-:` are read by nothing (`:661-696`).
  - One verb is computed for every target (`:697`, `:711`), and a non-write call skips every REST rule (`:1080`).
  - The unattended verdict reads the same `httpCall` (`:1966-1971`).
- **causal_chain:**
  1. `curl -X DELETE …/git/refs/heads/feat --next -X GET https://example.com`: the final method is `GET`.
  2. `write` is false, so `:1080` continues before the ref-deletion rule (`:1116`).
  3. curl still sends the first request as `DELETE`, a person-only remote branch deletion, in either mode.
- **smallest_fix:** In both dispatchers (`:1209`, `:1966`), split a curl call's words at `--next`/`-:` and judge each request as its own `["curl", …part]`.
- **test_rows:**
  - Deny the reviewer's line (push-delete), and the same with `-:`.
  - Unattended, deny `curl -X PATCH https://api.github.com/repos/o/r/pulls/3 --next -X GET https://example.com`.
  - Allow `curl https://a.example --next https://b.example`.

### J4: curl `-K`/`--config`

- **decision:** ACCEPT
- **severity:** Warning
- **confidence:** guard half high, `direct`. That config-file lines act like command-line options: medium, `unverified`.
- **applicability:** current
- **evidence:**
  - `-K` and `--config` are skipped together with their value (`personOnly.ts:653`, `:679-680`).
  - `--config=f` and a short cluster such as `-sK f` fall through, and the file name is then read as a target (`:681-695`).
  - The unattended verdict reads it the same way (`:1966`).
- **causal_chain:**
  1. The request method and URL live inside the config file.
  2. The guard sees neither, so no REST rule matches.
  3. curl sends `DELETE …/git/refs/heads/feat`, and the guard allows it.
- **smallest_fix:** In `httpCall`, in both copies of the shared reading block, refuse any curl call with `-K`/`--config` in any spelling (attached value, `=` form, inside a cluster, `-K -` for stdin). Neither the method nor the target can be shown, so whether the call is a write cannot be decided either. Throw a coded error, the way `NESTING_DEPTH` is thrown (`:441`), and the guard already refuses it (`scripts.ts:3775-3779`).
- **test_rows:**
  - Throws: `curl -K req.cfg`, `curl --config=req.cfg https://api.github.com/repos/o/r`, `curl -sK req.cfg`, `curl -K - https://example.com`.
  - Plain `curl https://api.github.com/repos/o/r` stays allowed.
- **Same-class gaps, not raised:** curl's default `.curlrc` (moved with `CURL_HOME`), and wget's `--config`, `WGETRC` and `~/.wgetrc`, hide a method the same way. Refuse wget `--config` alongside `-K`, and name the default config files as a respelling residual (`SECURITY.md:426-440`).

### J5: GraphQL repository-administration mutations

- **decision:** ACCEPT
- **severity:** Warning
- **confidence:** guard half high, `direct`. The mapping below is medium, `unverified`: it comes from my knowledge of GitHub's GraphQL schema, not read at this tier.
- **applicability:** current. `SECURITY.md:526-529` names only acts "respelled past" the guard, and an inline mutation is shown in the line's text.
- **evidence:**
  - The GraphQL branch (`personOnly.ts:1030-1078`) reads merges, ready, reviews, commits, merges into a branch and ref writes, then `continue`s.
  - Their REST twins are refused: protection and rulesets (`:1093`), the repository's own PATCH or DELETE (`:1097`), a branch rename (`:1100`), a transfer (`:1101`).
  - The rule promises all of these (`:95`).
  - `GRAPHQL_MOVES` (`:1742-1743`) lacks them too.
- **causal_chain:**
  1. `gh api graphql -f query='mutation{archiveRepository(…)}'` resolves to the path `graphql`.
  2. No regex in `:1032-1077` matches, so the call reaches `continue` at `:1078`.
  3. The repository is archived, a `protection` act, and the verdict says allowed.
- **mapping (unverified):**

| Act | GraphQL mutation | Note |
|---|---|---|
| archive | `archiveRepository`, `unarchiveRepository` | |
| rename | `updateRepository` (`name`) | Deny `updateRepository` whole, as the REST PATCH is refused whole (`:1097`) |
| visibility, default branch | none known (`UpdateRepositoryInput` has neither field) | REST only, already refused at `:1097` |
| delete | no repository-delete mutation known | REST only |
| transfer | no repository-transfer mutation known (`transferIssue` moves an issue) | REST only |
| branch rename | none known | REST only |
| protection (same rule id) | `create`/`update`/`deleteBranchProtectionRule`, `create`/`update`/`deleteRepositoryRuleset` | Their REST twins are refused at `:1093` |

- **smallest_fix:** One line in the GraphQL branch: `if (/\b(archiveRepository|unarchiveRepository|updateRepository|(create|update|delete)(BranchProtectionRule|RepositoryRuleset))\b/.test(text)) return deny("protection", "A GraphQL repository, protection or ruleset write");`
- **test_rows:**
  - Deny each mutation name through `gh api graphql -f query=…` and through a curl POST to `/graphql`.
  - Allow `gh api graphql -f query='query{repository(owner:"o",name:"r"){isArchived}}'`.

### J7: curl URL globbing

- **decision:** ACCEPT
- **severity:** Warning. It reaches every path rule, not only the ref rule.
- **confidence:** guard half high, `direct`. That globbing is on by default: medium, `unverified` (the reviewer reports a run on curl 8.5.0).
- **applicability:** current
- **evidence:**
  - Targets are kept as written (`personOnly.ts:693-695`) and normalized without expansion (`:698-710`).
  - The ref rules match the literal text (`:1115-1133`, the branch names at `:1129-1131`).
  - `{pulls/3/merge,x}` misses the merge rule (`:1081`). `{graphql,x}` misses the GraphQL branch (`:1030`), which skips every GraphQL check.
  - The unattended rules miss the same way (`MOVES`, `:1733-1741`, `:1970`).
- **causal_chain:**
  1. The path is read as `git/refs/heads/{feature,main}`.
  2. The branch name `{feature,main}` is not a default branch (`:1131`).
  3. curl sends PATCH to `main`: a default-branch write, forceable, allowed.
- **smallest_fix:** In the shared `httpCall`, throw the same coded error for a curl write (POST, PUT, PATCH, DELETE or a body) whose raw target contains `{` or `[`, unless `-g`/`--globoff` is on the line (a cluster such as `-sg` included). Reads stay allowed.
- **test_rows:**
  - Throws: the reviewer's PATCH, `curl -X PUT 'https://api.github.com/repos/o/r/{pulls/3/merge,x}'`, and `curl -d '{"query":"…"}' 'https://api.github.com/{graphql,x}'`.
  - Allowed: the same PATCH with `--globoff` (judged literally), `curl 'https://example.com/p[1-3].html'`, `curl 'http://[::1]:3000/health'`.

### J8: wget `-i`/`--input-file`

- **decision:** ACCEPT
- **severity:** Warning
- **confidence:** guard half high, `direct`. That wget applies `--method` to every URL in the file: medium, `unverified` (the reviewer reports a run on wget 1.21.4).
- **applicability:** current
- **evidence:**
  - `-i` is not a value flag (`personOnly.ts:649-655`), so `urls.txt` is read as a target (`:693-694`).
  - The prefix expansion has no `--input-file` (`:615-621`).
  - The unattended verdict reads it the same way (`:1966`).
- **causal_chain:**
  1. `wget --method DELETE -i urls.txt` is read with the path `urls.txt`.
  2. No rule matches that path.
  3. wget sends DELETE to the protected URL listed in the file, and the guard allows it.
- **smallest_fix:** In the shared `httpCall`, throw the coded error for wget when `-i`/`--input-file` appears in any spelling (attached value, `=` form, a cluster ending in `i`, the prefix `--input-f`) and the verb is a write. A plain `wget -i urls.txt` (GET) stays allowed.
- **test_rows:**
  - Throws: `wget --method DELETE -i urls.txt`, `wget --post-data=x --input-file=u.txt`, `wget -e method=PUT -qi u.txt`.
  - Allowed: `wget -i urls.txt`.

### J9: MCP `create_pull_request`

- **decision:** ACCEPT
- **severity:** Warning. A non-draft PR with unscreened title and body. Outbound screening of comments is already model-followed text (`SECURITY.md:107`), so the extra exposure is the draft-handoff bypass.
- **confidence:** high, `direct` for the missing row and the guard skipping MCP calls. The tool's name: medium, `unverified` (the reviewer cites the server's README).
- **applicability:** current
- **evidence:**
  - The tool is absent from `CLAUDE_DENY_ROWS` (`personOnly.ts:186-202`; the list test at `test/hooks/personOnly.test.ts:1312-1326`).
  - The shell guard allows any call that is not a shell call (`scripts.ts:3717`) and is wired to shell tools only (`:144-147`).
  - `gh pr create` is refused unattended (`personOnly.ts:1956`).
  - The residual pages name thirteen MCP rows (`SECURITY.md:105`, `:400-409`; `docs/specs/everyday-flows.md:3876-3880`).
- **causal_chain:**
  1. An unattended Claude Code session calls `mcp__github__create_pull_request`.
  2. No deny row matches and no hook inspects the call.
  3. A PR opens before `checkpoint`/`end`, outside the run verbs' draft PR and their title and body screen.
- **smallest_fix:** Add the row `"mcp__github__create_pull_request"` to `CLAUDE_DENY_ROWS`, with a comment that `gh pr create` through the shell stays the route in an attended session.
- **test_rows:**
  - `MCP_ROWS` gains the row. It is a gating list, so the edit carries an inline reason.
  - The settings and emission goldens are re-pinned.
  - The counts in `SECURITY.md:105`, `:400` and in the spec move from thirteen to fourteen.
- **design_note:** I recommend the deny row over a mode-aware hook.
  - **For the row:** the code already does this for `update_pull_request`, refused whole in attended sessions too with the shell as the route (`personOnly.ts:133-134`, `SECURITY.md:105`). It is one row, it cannot be switched off by a run rewriting its own record head (the residual at `SECURITY.md:488-495`), and it adds no new wiring.
  - **The hook alternative** has a model in the ask gate (`scripts.ts:130-134`, `:3910-3926`, `unattendedSource` at `:4093-4118`). It would need a new matcher, wiring in `src/adapters/claude.ts` (outside this brief's scope), and it would inherit the record-head escape.
  - **The cost of the row:** attended sessions lose PR creation through MCP. If any flow text depends on it, the hook becomes the better choice, which the first unknown below would settle.

---

### Breaking-change candidates
| Category | Location | Current | Proposed | Consumers found | Confidence |
|---|---|---|---|---|---|
| `api_signature` (throw contract) | `personOnlyVerdict` / `unattendedPushVerdict`, `personOnly.ts:227`, `:1237` | throw only `NESTING_DEPTH` | also throw a new HTTP-undecidable code (J4, J7, J8) | guard catch-all `scripts.ts:3773-3779`; the run verbs' person-only check of the push command (`SECURITY.md:106`, `run.ts`, not read) | medium, `inferred` |
| `type_shape` | `PersonOnlyContext`, `personOnly.ts:106-116` | three fields | optional `symrefs` (J1, push-time half only) | `contextsOf` at `scripts.ts:3587-3611`, test fixtures | low, `unverified`; none if the field is optional or this half is skipped |

### Unknowns
- **Does any flow text use `mcp__github__create_pull_request` in attended sessions?** Probed: `src/hooks/**`, `test/hooks/**`, `SECURITY.md`, the spec. `content/` was out of scope. Smallest input: a grep of `content/` for `create_pull_request`. Confidence: low, `unverified`.
- **The GitHub GraphQL mutation list (J5).** Probed: nothing at the `codebase` tier. Smallest input: a `+docs` read of the GraphQL mutations reference. Confidence: medium, `unverified`.
- **How `run.ts` handles a new thrown code from `personOnlyVerdict`.** Out of scope; smallest input: a read of its call site. Confidence: low, `unverified`.

Every change to `httpCall` must land in both copies of the shared reading block; the copy-equality test (`test/hooks/personOnly.test.ts:1377-1385`) fails otherwise. The emitted guard carries the function source (`scripts.ts:3193-3195`), so its goldens need re-pinning, as in commit `08d28112`.

**Sources consulted:** `src/hooks/personOnly.ts`, `src/hooks/scripts.ts`, `test/hooks/personOnly.test.ts`, `SECURITY.md`, `docs/specs/everyday-flows.md` (REQ-FLOW-102, -104, -120), and the brief file `brief-r4.txt`.
