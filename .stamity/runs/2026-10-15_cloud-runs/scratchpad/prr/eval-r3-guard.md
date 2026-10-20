**status:** DONE

I checked all six findings against HEAD `d137ef85`. Every claim holds in the code: none of the six forms is refused today by another rule, in either mode, and none is named as a residual. Each record below carries its own severity. Two choices are left for the triage ask: the mode for H7, and the denial mechanism for H9.

### Severity and decision overview

| Finding | Decision | Severity | Applicability | Fix lands in |
|---|---|---|---|---|
| H1 `npm pub` | ACCEPT | Warning | current | `publishVerdict` |
| H2 Corepack | ACCEPT | Warning | current | shell-reading, both copies |
| H4 `git update-ref` tags | ACCEPT | Minor | current | dispatcher |
| H7 gh aliases | ACCEPT (mode is the triage ask) | Warning | current | unattended verdict + residual, or always-on |
| H8 `enqueuePullRequest` | ACCEPT | Warning | current | `httpVerdict` (+ unattended for parity) |
| H9 depth limit | ACCEPT | Warning (it reaches every rule) | current | shell-reading, both copies |

`src/hooks/scripts.ts` builds the emitted guard from each function's `toString()` (`scripts.ts:3187`, `:3189`). Every fix below therefore lives in `src/hooks/personOnly.ts`. H2 and H9 touch the `<shell-reading>` helpers, so both copies change, and `test/hooks/personOnly.test.ts:1265-1282` holds the two copies equal.

---

### H1 — npm's publish abbreviations

- **decision:** ACCEPT
- **severity:** Warning
- **confidence:** high that the guard misses it (`direct`: the line traced below). Medium on which spellings npm accepts (`inferred`: the reviewer's observed run plus npm's abbreviation rule, with npm's command list recalled rather than read. See Unanswerable U1).
- **applicability:** current
- **evidence:** `src/hooks/personOnly.ts:1137-1143` matches only `word === "publish"`. Dispatch is at `:1165`; the act row at `:87`; the deny prefix at `:165`. Tests have only exact spellings (`test/hooks/personOnly.test.ts:326-350`), and `npm pack` is asserted allowed at `:542`. Nothing in `unattendedPushVerdict` reads publish.
- **causal_chain:** (1) `npm pub` splits into `["npm","pub"]`. (2) `:1165` sends it to `publishVerdict`. (3) Positionals are `["pub"]`, and `"pub" !== "publish"` at `:1139`, so the verdict is `{ deny: false }`. (4) npm expands `pub` to `publish` and publishes.
- **Q2 answer:** npm resolves a unique prefix of its command list. The `p` commands are pack, ping, pkg, prefix, profile, prune and publish. `p` is ambiguous; `pu` is unique. So `pu`, `pub`, `publ`, `publi`, `publis` and `publish` all reach publish. Matching `/^pu(?:b(?:l(?:i(?:sh?)?)?)?)?$/` (the same as `word.length >= 2 && "publish".startsWith(word)`) never matches `prune` (`pr…`) or `pack` (`pa…`). Apply it only where the manager is npm (`cmd[0] === "npm"`, or the positional before it is `npm`). pnpm, yarn and bun run a script by that name instead.
- **smallest_fix:** At `:1139`, accept `/^pu(?:b(?:l(?:i(?:sh?)?)?)?)?$/` where the manager word is `npm`, and keep the exact `publish` match for the other managers.
- **test_rows:** Denied: `npm pub`, `npm pu`, `npm publ --access public`, `npx npm pub`, `npm exec -- npm pub`. Allowed: `npm prune`, `npm pack`, `npm run pub`, `pnpm pub`.
- **adjacent, same function (not in the brief):** `npm --loglevel silly publish` passes. `--loglevel` is missing from `valued` (`:1127-1128`), so `silly` becomes positional 0, `publish` sits at index 1, and the word before it is not a manager (`:1140-1141`). `inferred`, medium confidence, Warning. Note `--loglevel` appears in tests only before `exec` (`test/hooks/personOnly.test.ts:453`, `:674`). Fix: skip any `--<key> <value>` before the subcommand, as `commandsOf` already does at `:446`. `npm unpublish` is also not in the person-only table (`:87`), which is a policy question, not a defect.

### H2 — Corepack in front of a package manager

- **decision:** ACCEPT
- **severity:** Warning
- **confidence:** high (`direct`, traced below). The `corepack <pm>@<version>` syntax is `unverified` at this tier.
- **applicability:** current
- **evidence:** `src/hooks/personOnly.ts:224-225` and `:1195-1196` have no `corepack` in `WRAPPERS`. `:1165` dispatches on the program word only. `programName` (`:266-269`) strips a path and a Windows suffix but not an `@version`.
- **causal_chain:** (1) `corepack pnpm publish` gives the program `corepack`. (2) It is neither a wrapper nor a manager, so `commandsOf` keeps it as the program (`:454`, `:495`). (3) No dispatcher branch matches `corepack`, so the verdict is `{ deny: false }`. (4) Corepack runs `pnpm publish`.
- **smallest_fix:** Add `"corepack"` to `WRAPPERS` in both copies, with no options. Also strip a trailing `@<version>` in `programName` (both copies), so `corepack pnpm@9 publish` reads as `pnpm`.
- **test_rows:** Denied: `corepack pnpm publish`, `corepack yarn npm publish`, `corepack pnpm@9.1.0 publish`, `npx npm@10 publish`. Allowed: `corepack enable`, `corepack pnpm install`. Unattended denied, since the wrapper is shared: `corepack pnpm exec git push origin feat/x`.
- **adjacent:** Without the `@version` strip, `npx npm@10 publish` passes today too, because `npm@10` is not in `MANAGERS`. The only test is `npx npm publish` (`test/hooks/personOnly.test.ts:330`). `inferred`, medium confidence.

### H4 — tag writes through `git update-ref`

- **decision:** ACCEPT
- **severity:** Minor. Only the local tag write escapes. Pushing that tag is still refused: attended by `push-tags` (`:793-800`), because `ctx.tags` is read from disk on access (`:710-711`, `src/hooks/scripts.ts:3606-3635`) and so lists a tag made this way; unattended by every raw push being refused (`:1839`).
- **confidence:** high (`direct`)
- **applicability:** current
- **evidence:** The dispatcher (`src/hooks/personOnly.ts:1150-1162`) branches on `push`, `send-pack`, `tag` and `subtree` only. The `tag` act row is at `:80`. `update-ref` is in `GIT_BUILTINS` (`:1707`), so it passes unattended too.
- **causal_chain:** (1) `git update-ref refs/tags/v1 HEAD` gives `sub = "update-ref"` (`:1151`). (2) No branch matches, so the verdict stays `null`. (3) Unattended, it is a known builtin (`:1881`) and passes. (4) git creates or, with `-d`, deletes the local tag, which the `tag` rule exists to keep the person's.
- **smallest_fix:** At `:1156`, add `else if (sub === "update-ref" && (args.some((a) => /^(refs\/)?tags\//i.test(a)) || (args.includes("--stdin") && /refs\/tags\//i.test(command)))) verdict = deny("tag", "A tag ref write (`git update-ref`)")`. Name a `--stdin` read from a file or heredoc in the residual.
- **test_rows:** Denied: `git update-ref refs/tags/v1 HEAD`, `git update-ref -d refs/tags/v1`, `printf 'create refs/tags/v1 HEAD\n' | git update-ref --stdin`. Allowed: `git update-ref refs/heads/feat/x HEAD`. Residual (allowed): `git update-ref --stdin < refs.txt`.

### H7 — gh aliases

- **decision:** ACCEPT. The gap is real and named nowhere. Choosing the mode is the triage question; a recommended default is below.
- **severity:** Warning
- **confidence:** high for the guard trace (`direct`). Medium for gh's behaviour: alias expansion before dispatch, and refusing an alias that shadows a built-in command (`inferred` from the reviewer's isolated `GH_CONFIG_DIR` run plus recall, not read here).
- **applicability:** current
- **evidence:** `ghVerdict` (`src/hooks/personOnly.ts:854-897`) has no branch for an unknown group and returns `null` at `:896`. `ghPositionals` is at `:582-590`. The unattended gh handling (`:1885-1897`) refuses only `pr create|new|edit|close|reopen|update-branch`, `repo sync` and `repo create --push`. The residual names only "a git or shell alias" (`:30`, `SECURITY.md:417-425`).
- **causal_chain:** (1) `gh alias set land 'pr merge'` has group `alias` and passes both verdicts. (2) `gh land 123` has group `land`, falls through `:870-895` and returns `null`; unattended, `land` matches nothing at `:1889-1896`. (3) gh expands `land` to `pr merge 123`, which merges without the person.
- **Q3 answer:**
  - **Reading gh's config:** possible in the guard, not in the verdict. The guard already reads files (`scripts.ts:3160`, `localTags` at `:3606`), but `personOnlyVerdict` is pure (`:39`), so the aliases would arrive as a new `PersonOnlyContext` field (`:102-112`). That route also needs a YAML reading of `config.yml` with no dependency, re-reading each expansion as a line (`!` shell aliases run anything), and refusing `gh alias set` / `import` anyway: a line that defines and uses an alias at once (`gh alias set x 'pr merge' && gh x 1`) runs after the config was read. It also leaves gh extensions open (`gh extension install` followed by `gh <ext>`).
  - **Refusing an unknown top-level group:** closes aliases, line-local definitions and extensions in one check. It mirrors the git precedent: `GIT_BUILTINS` is pinned to a version (`:1693-1709`) and an unknown subcommand and `-c alias.*` are refused unattended only (`:1844-1846`, `:1881`), while attended the git alias is a named residual (`SECURITY.md:417-423`).
  - **Recommended default:** in `unattendedPushVerdict`, refuse a `gh` group outside a pinned built-in list (with gh's shipped default alias `co`) and refuse `gh alias set|import`. Always-on, add "a gh alias or extension" to the residual at `:30` and `SECURITY.md:418`.
  - **Alternative:** the same refusal always-on. That closes the attended `pr merge` alias too, but refuses attended extension use (`gh dash` and the like).
- **smallest_fix:** Add a `GH_BUILTINS` set (read from `gh help` at a pinned gh version) to `unattendedPushVerdict`, refuse a group outside it plus `gh alias set|import`, and name the attended residual.
- **test_rows:** Unattended denied: `gh land 123`, `gh alias set land 'pr merge'`, `gh alias import aliases.yml`. Unattended allowed: `gh pr view 3`, `gh co 3`. Always-on residual block (`test/hooks/personOnly.test.ts:776-795`): `gh land 123` allowed.

### H8 — GraphQL merge-queue enrollment

- **decision:** ACCEPT
- **severity:** Warning
- **confidence:** high for the regex (`direct`). That `enqueuePullRequest` adds a pull request to the merge queue is `unverified` here: the reviewer cites GitHub's docs, which are outside the codebase tier.
- **applicability:** current
- **evidence:** `src/hooks/personOnly.ts:1019` matches only `mergePullRequest|enablePullRequestAutoMerge`. The unattended `GRAPHQL_MOVES` (`:1691-1692`) lacks it as well. The act row is at `:83`.
- **causal_chain:** (1) `gh api graphql -f query='mutation { enqueuePullRequest(…) … }'` reaches `httpVerdict` with the path `graphql` (`:895`, `:1018`). (2) None of the regexes at `:1019-1064` match, so the loop continues and returns `null`. (3) Unattended, `GRAPHQL_MOVES` misses it too. (4) The queue merges the pull request later with no person-only act.
- **smallest_fix:** Add `enqueuePullRequest` to the alternation at `:1019`, and to `GRAPHQL_MOVES` at `:1692` for parity with `mergePullRequest`.
- **test_rows:** Denied as `pr-merge`: `gh api graphql -f query='mutation { enqueuePullRequest(input: {pullRequestId: "x"}) { mergeQueueEntry { id } } }'`. Allowed: `gh api graphql -f query='query { repository(owner:"o",name:"r") { mergeQueue { entries { totalCount } } } }'`.

### H9 — past the nested-command depth limit

- **decision:** ACCEPT
- **severity:** Warning. It is the broadest of the six: any rule, in both verdicts, falls to literal wrapping.
- **confidence:** high (`direct`, traced through every recursion site)
- **applicability:** current
- **evidence:** Every recursion is guarded by `depth < 4` at `src/hooks/personOnly.ts:498, 504, 508, 512, 514, 523, 531, 559`, and the same in the unattended copy (`:1469-1530`). No test covers depth.
- **causal_chain:** (1) Layer *n*'s script is read at depth *n*, so with five `sh -c` layers the fifth is read at depth 4. (2) At depth 4, `:508` is false, so the inner script is never read and only `["sh","-c",…]` is pushed (`:557`). (3) The dispatcher sees only `sh` and returns `{ deny: false }`. With four layers the push is still read at depth 4 as a plain command and denied. (4) The shell runs the inner force push, merge or publish.
- **Q4 answer:**
  - **Today:** at the limit the guard silently stops reading. It does not refuse. The cap is load-bearing for cost: each level can read its text twice (PowerShell `:433`, braces `:434`, carets `:530`), which is about 2^depth work, so lifting the cap is not the fix.
  - **Smallest fail-closed change:** drop the eight `depth < 4 &&` guards in each copy and start `commandsOf` with `if (depth > 4) throw Object.assign(new Error("nesting"), { code: "NESTING_DEPTH" })`. The guard already refuses on a coded throw (`src/hooks/scripts.ts:3762-3768`).
  - **The other caller:** `run.ts:866` does not catch, but it passes `git push origin HEAD:refs/heads/<branch>`, and an unquoted `$(`/`(` splits segments rather than nesting (`:405`), so it cannot reach depth 5 (`inferred`).
  - **The alternative** is a new rule id: wider `PersonOnlyRuleId` (`:43-54`) and a `PERSON_ONLY_RULES` row.
- **smallest_fix:** Make the recursion unconditional and throw a coded `NESTING_DEPTH` error at entry when `depth > 4`, in both copies.
- **test_rows:** Denied by the guard: five `sh -c` layers around `git push --force origin feat/x`, built in a loop with `'\''` quoting. Denied: four layers (already true, pin it). Refused fail-closed: five layers around `git status`. The equal-copies test (`:1265`) still passes.

---

### Breaking-change candidates

| Category | Location | Current shape | Proposed shape | Consumers found | Confidence |
|---|---|---|---|---|---|
| `api_signature` (throw contract) | `personOnlyVerdict` `:220`, `unattendedPushVerdict` `:1191` | never throws | throws `NESTING_DEPTH` past depth 4 (H9's throw route only) | `src/hooks/scripts.ts:3747`, `:3752` (caught at `:3762`); `src/cli/commands/run.ts:866` (uncaught; inferred unreachable) | high, `direct` |
| `api_signature` (parameter shape) | `PersonOnlyContext` `:102-112` | 3 fields | + gh aliases field (H7's config route only) | `scripts.ts:3745`, `run.ts:866-870`, tests | high, `direct` |

H1, H2, H4 and H8 only widen what is denied, so there is no candidate from them. A new `Bash(npm pub:*)` or `Bash(corepack pnpm publish:*)` row in `CLAUDE_DENY_ROWS` is optional; it stays consistent as long as the verdict denies its prefix (`:121-122`).

### Unanswerable

| # | Question | Probed | Why not settled | Smallest input | Confidence |
|---|---|---|---|---|---|
| U1 | npm's exact command list, so `pu` is known to be unique, and whether npm 11 still expands abbreviations | read `personOnly.ts:1126-1145` and its tests; npm sources are out of scope | npm's `lib/utils/cmd-list.js` is not in scope at the codebase tier | `npm pu --help` on the pinned npm, or that file read | medium, `inferred` |
| U2 | gh's built-in group list, its default aliases beyond `co`, and its config path resolution | read `ghVerdict` and the unattended gh handling | gh's sources and `gh help` are outside the tier | `gh help` and `gh alias list` on a pinned gh version | low, `unverified` |
| U3 | Whether `corepack <pm>@<version>` is accepted syntax | read `WRAPPERS` and `programName` | Corepack is not in scope | `corepack pnpm@9 --version` | low, `unverified` |
| U4 | Whether GitHub's `enqueuePullRequest` is a mutation as described | read the regex at `:1019` | GitHub's docs are outside the tier | the cited GitHub GraphQL mutations page | low, `unverified` |

**Sources consulted:** `src/hooks/personOnly.ts`, `src/hooks/scripts.ts` (3187-3189, 3600-3768), `test/hooks/personOnly.test.ts`, `SECURITY.md` (395-563), `src/cli/commands/run.ts` (855-879, read only to check a caller of the verdict), and the brief at `brief-r3.txt`.