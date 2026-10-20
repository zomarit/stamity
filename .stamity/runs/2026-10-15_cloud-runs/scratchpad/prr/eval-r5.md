status: DONE

All four claims hold at 20abe813. The verdicts are ACCEPT ×4, and one fix is a sub-part of K4 that I recommend leaving out (see K4). Only K1 touches the shared reading block. K2, K3 and K4 sit outside it, so the copy-equality test (`test/hooks/personOnly.test.ts:1656-1665`) only matters for K1.

---

## K1 (pr/93): Normalize HTTP paths before classifying protected routes

- **decision:** ACCEPT
- **severity:** Critical. Both verdicts miss it, including the unattended push rule's REST checks. No residual covers it, because the dot segments are written on the line itself.
- **confidence:** high, `direct` for the guard side (traced line by line through the code, not run). medium, `unverified` for wget and gh behaviour (see Unknowns).
- **applicability:** true at 20abe813. It is not named as a residual. `SECURITY.md:105` (Residual cell) and `src/hooks/personOnly.ts:29-45` list text the line cannot show. Dot segments are not among them, and no test holds a dot segment as allowed (no `/../` in `test/hooks/personOnly.test.ts`).
- **evidence:**
  - `src/hooks/personOnly.ts:777-789` (first copy) and `:1887-1899` (second copy): the path cut. It removes the scheme and host, the leading `/`, `api/v3/`, the query, percent-encoding, the trailing `/`, then `repos/<o>/<r>/` and `orgs|enterprises|users|repositories/<x>/`. It never resolves `.` or `..`.
  - `src/hooks/personOnly.ts:1238-1239`: the ref deletion matches only `^git/refs`.
  - `src/hooks/personOnly.ts:1912-1920`: the unattended `MOVES` rules are anchored the same way (`^git/…`, `^contents`, `^pulls…`).
  - `src/hooks/personOnly.ts:1220`: the repository's own path is matched only as the whole `repos/<o>/<r>`.
- **causal_chain:**
  1. The comment's target, `curl -X DELETE https://api.github.com/repos/o/r/tmp/../git/refs/heads/feature`, is cut at `:787` to `tmp/../git/refs/heads/feature`.
  2. `^git/refs` at `:1238` does not match, so the `push-delete` rule never fires, and `personOnlyVerdict` returns `{ deny: false }`.
  3. `unattendedPushVerdict` gets the same `paths` from the shared `httpCall` (`:2147`). `MOVES` (`:1917`) does not match either, so the unattended REST rule passes it too.
  4. curl removes the dot segments before sending, so GitHub receives `/repos/o/r/git/refs/heads/feature`. The ref is deleted. A `..` placed before the cut, as in `repos/x/y/../../o/r`, also escapes the repository-path rule at `:1220` and every rule anchored after the cut.
- **where to normalize (Q2):** inside `httpCall`'s `paths` map, after the percent-decode (`:784`) and before the trailing-slash drop (`:786`) and the `repos/…` cut (`:787`). Normalizing after the cut misses a `..` that climbs out of `repos/<o>/<r>`.
- **`--path-as-is` (Q2):** this flag turns off curl's dot squashing. The guard does not read it today: it is not in curl's `LONG` list (`:657-658`) or in `valueFlags` (`:714-717`), so it falls through as a flag that takes no value.
- **smallest_fix:** in the `paths` map, give each target two paths: the decoded path as it reads today, and the same path with its dot segments resolved (RFC 3986 §5.2.4). The verdicts already deny when any path matches, so this only ever adds denials (the module's stated reading at `:573` and `:653`).
  - It needs no reading of `--path-as-is` or its prefixes, and it covers wget and `gh api` whatever each one does.
  - Make the edit as one text in both copies (`:777-789` and `:1887-1899`) so the copy-equality test stays green.
  - The option of normalizing only when `--path-as-is` is absent is weaker. It needs the prefix expansion added to `LONG`, and a misread would lift a denial.
- **test_rows:**
  - Denied (deny matrix, rule `push-delete`): the comment's curl DELETE through a `tmp/..` segment.
  - Denied (`push-default`): a REST ref PATCH whose path reaches the default branch through a `..` segment.
  - Denied (`protection`): a PATCH on the repository path written as another repository's path followed by two `..` segments.
  - Denied (`push-delete`): the same as the first row, spelled with a `.` segment.
  - Unattended: a REST write on `contents/` reached through a `..` segment is denied.
  - Allowed: a read (GET) through a dot segment, and a write whose normalized path lands on a path no rule names.
  - The embedding test at `:1676-1683` replays `DENY` and `ALLOW` against the function source, so the new rows are checked there too.

## K2 (pr/94): Apply person-only checks to `gh repo sync`

- **decision:** ACCEPT
- **severity:** Warning. Only attended sessions are exposed: unattended, `gh repo sync` is already refused whole at `src/hooks/personOnly.ts:2136`.
- **confidence:** high, `direct` for the gap. medium, `unverified` for how gh splits a local sync from a remote one.
- **applicability:** true. `ghVerdict` (`src/hooks/personOnly.ts:979-1022`) has no `sync` branch, so `gh repo sync owner/repo` falls through to `return null` at `:1021`. It is not a named residual. `SECURITY.md:105` lists `gh repo sync` only among the unattended refusals, and the only test row is the unattended one at `test/hooks/personOnly.test.ts:1146`.
- **evidence:**
  - `src/hooks/personOnly.ts:1011-1019`: the only `gh repo` rules in the always-on verdict.
  - `:2136`: the unattended refusal.
  - `:1228-1233`: REST `merge-upstream` onto the default branch is denied as `push-default`.
  - `:1250`: a forced REST ref update is denied as `force-push`.
  - `:629-637`: `ghPositionals` skips only `-R`/`--repo` and their value.
- **causal_chain:**
  1. In an attended session, `gh repo sync owner/repo` reaches `ghVerdict`. The group is `repo`, the subcommand `sync`, and no rule names it.
  2. `personOnlyVerdict` returns `{ deny: false }`. The unattended verdict refuses it only while a run is unattended (`:2136`).
  3. gh updates the destination's default branch. Per the comment's quote of the manual (`brief-R5.txt:13`) it does this with a fast-forward, or with a hard reset under `--force`. That is the REST `merge-upstream` or forced ref PATCH which `:1230` and `:1250` already deny, so the built-in form gets around rules its REST forms obey.
- **local vs remote (Q3):** going by gh's manual as I remember it (`unverified`), a sync with no destination repository argument has the local checkout as its destination. It updates the local branch from the remote, and nothing remote is written. A destination argument makes the sync remote.
  - The guard can tell the two apart by whether a positional word follows `sync`. That count must skip the values of `-b`/`--branch` and `-s`/`--source`, which `ghPositionals` does not do. Without that, a local sync naming a branch reads as a remote one. That error refuses rather than allows, but it would refuse a legitimate local sync.
- **rule mapping (Q3):**
  - Remote destination with `--force`: `force-push`, checked first, the same order as `pushVerdict` at `:878`.
  - Remote destination with no `--branch`, a `--branch` naming a default branch, or a `--branch` value holding `$` or a backtick: `push-default`. With no branch given, the target is the source's default branch, and the guard cannot read the destination's default.
  - Remote destination with `--branch` naming another branch and no `--force`: allowed, matching an attended feature-branch push.
  - Local destination: stays allowed when attended (no remote write). Unattended it is already refused.
- **smallest_fix:** add a `sync` branch in `ghVerdict`, outside the shared block, so copy equality is not affected. Count positionals locally, skipping the `-b`/`--branch`/`-s`/`--source` values (and keeping the `-R` skip), rather than editing `ghPositionals`. Editing that helper would touch both shared copies and change the unattended verdict's reading (`:2129`). Then apply the mapping above.
  - Optional: extend the `PERSON_ONLY_RULES` text at `:74` and `:78` to name the sync forms.
- **test_rows:**
  - Denied (`push-default`): the comment's sync of a named repository with no branch, and the same naming the default branch through the branch flag.
  - Denied (`force-push`): a sync of a named repository with `--force`, with or without a branch.
  - Allowed (attended): a sync with no repository argument, also with `--force` and with a branch flag. Also a sync of a named repository to a non-default branch without `--force`.
  - Allowed: a local sync naming a source repository through `--source` (this guards the positional-skip fix).
  - The unattended row at `:1146` stays as it is.

## K3 (pr/95): Fail closed when the local tag inventory exceeds its cap

- **decision:** ACCEPT
- **severity:** Minor. It needs more than 10,000 local tags, it is attended only (every raw push is refused unattended), and the outcome is a residual already written down in code. The fix brings it in line with the run-folder cap's precedent.
- **confidence:** high, `direct`.
- **applicability:** true. Partly named:
  - `src/hooks/personOnly.ts:33` lists "a bare tag name the context's `tags` does not list" as a residual that passes.
  - `test/hooks/personOnly.test.ts:1008-1010` asserts a bare-name tag push allowed when the context does not list the tag.
  - `SECURITY.md` does not name it: no hit for "tag name", "local tag" or the cap.
  - No test exercises the cap (no `TAG_NAMES` hit under `test/`).
- **evidence:**
  - `src/hooks/scripts.ts:3094-3095`: the caps (`GUARD_TAG_NAMES_MAX = 10_000`, `GUARD_PACKED_REFS_MAX_BYTES = 8_388_608`), templated in at `:3188-3189`.
  - `:3632`: the loose-ref walk silently stops at the cap.
  - `:3641`: a `packed-refs` file over 8 MiB is silently skipped. This is the same flaw, and the comment does not raise it.
  - `:3644`: packed tags past the cap are silently dropped.
  - `:3638-3649`: the packed read sits inside a bare `catch {}`, which would swallow a throw placed inside it.
  - `:3612-3615`: tags are read lazily through a getter, which runs inside `decide()`.
  - `:3782-3787`: any thrown error carrying a `code` is refused as "could not decide", naming the code.
  - `:3701`: the precedent, `RUN_FOLDERS_OVER_<max>`, which `SECURITY.md:524-529` documents.
- **causal_chain:**
  1. A checkout has more than 10,000 tags. `localTags` returns a truncated list and nothing marks it as incomplete.
  2. `isTagName` (`src/hooks/personOnly.ts:801-802`) misses a tag that was cut off, so `namesTag` is false for the comment's `git push origin <tag>`.
  3. `pushVerdict` reads the refspec as a branch and returns `null`. git pushes `refs/tags/<tag>`, which can recreate a tag deleted remotely or publish one that was local only.
- **Q4, coded throw or refusing flag:** use a coded throw, as `NESTING_DEPTH` and `RUN_FOLDERS_OVER_*` do. The guard's catch already turns it into a refusal with no new path, and the getter means only a push refspec ever reads tags (review/218, `test/hooks/personOnlyGuard.test.ts:312-345`). So the throw refuses only refspec pushes in such a repository.
  - A flag that refuses only bare refspecs would need a new context field, which changes the exported `PersonOnlyContext` (`src/hooks/personOnly.ts:110-120`), plus logic in `pushVerdict` outside the guard. That is a larger change.
- **smallest_fix:** in `localTags` (`scripts.ts:3621-3651`, emitted guard text, not the shared block):
  - Throw a coded error when a further tag is found once the list is full (loose or packed).
  - Throw one when `packed-refs` is over its byte cap.
  - The throws must sit outside the packed read's bare `catch {}`, or that catch must be narrowed to a missing file. Otherwise the throw is swallowed.
  - Name the cap in the code, following `:3701`, and add a line to `SECURITY.md` next to the run-folder-ceiling entry (`:524-529`).
  - Expect the tree-digest goldens to be re-pinned and the script budget re-checked (the budget comment at `scripts.ts:231-235`, the re-pin precedent in commit 515dcf77).
- **test_rows:** guard-level, in `personOnlyGuard.test.ts` beside `:312`. To keep the fixture small, lower the cap for the test if the build allows it; otherwise seed `packed-refs` lines.
  - Denied, naming the code: a bare-refspec push in a repository with one tag more than the cap, and in one whose `packed-refs` is over the byte cap.
  - Allowed: the calls that read no tags (status, fetch, refspec-less push off the default branch) in that same repository. This proves the throw stays lazy.
  - Allowed: a repository with exactly the cap's number of tags still reads all of them and denies a listed tag by name.

## K4 (pr/96): Deny `gh repo unarchive`

- **decision:** ACCEPT
- **severity:** Warning. It is a gap in the always-on verdict, and its REST and GraphQL twins are both already denied.
- **confidence:** high, `direct` for the gap. low, `unverified` for the gh flag inventory in the sibling survey.
- **applicability:** true. It is not named as a residual. `SECURITY.md:105` names the GraphQL `unarchiveRepository` refusal only.
- **evidence:**
  - `src/hooks/personOnly.ts:1011-1013`: the refusal for `gh repo archive` lives here, in the list delete/archive/rename/transfer. `unarchive` is missing.
  - `:1152`: GraphQL `unarchiveRepository` is denied.
  - `:1219-1221`: REST PATCH or DELETE on the repository path is denied whole, which covers the archived flag.
  - `:188`: the `Bash(gh repo archive:*)` deny row, with no unarchive row beside it.
  - `:10` and `:99`: the module comment and the rule text say "archiving" only.
  - `test/hooks/personOnly.test.ts:399`: the archive deny row in the tests.
- **causal_chain:**
  1. The comment's `gh repo unarchive owner/repo --yes` reaches `ghVerdict`. `sub` is `unarchive`, which is not in the list at `:1011`.
  2. No other `repo` rule matches, so the verdict is `{ deny: false }`. The unattended verdict passes it too: `repo` is a built-in group, and the subcommand is neither `sync` nor `create --push`.
  3. The repository is made writable again. That is the write its GraphQL twin (`:1152`) and REST twin (`:1220`) are refused for.
- **siblings (Q5), compared with the REST rules:**
  - Already covered: `rename`, `delete`, `transfer`, `edit --default-branch` and `edit --visibility` (`:1011-1019`).
  - REST denies every PATCH on the repository path (`:1220`). `gh repo edit` is denied only for `--default-branch` and `--visibility`, and the description and homepage edits are deliberately allowed (`test/hooks/personOnly.test.ts:736`, `:738`). So other `gh repo edit` settings flags pass where their REST twin is refused. From memory of gh 2.x (`unverified`), these include the secret-scanning push-protection, advanced-security, auto-merge and update-branch toggles.
  - I recommend leaving that asymmetry out of K4. It is wider than the comment, and closing it needs a reading of gh's flag list. Record it as a follow-up candidate.
- **smallest_fix:**
  - Add `unarchive` to the list at `:1011`. This is outside the shared block, so copy equality is not affected.
  - Add a `Bash(gh repo unarchive:*)` row next to `:188`. Each `Bash` row must be a form the verdict denies (`:129-130`), so the verdict change has to land with it. It does not prefix any allowed line (test at `:1638-1652`).
  - Change "archiving" to "archiving or unarchiving" at `:10` and `:99`.
  - The new deny row changes the rendered `.claude/settings.json`, so expect to re-pin the emission goldens and to run this repository's own sync.
- **test_rows:**
  - Denied (`protection`): the comment's unarchive of a named repository with `--yes`, an unarchive of the current repository, and an unarchive with the repository given through `-R`.
  - The `CLAUDE_DENY_ROWS` suite covers the new row.
  - Allowed rows stay allowed: the repository view, clone and description edits at `:735-738`.

---

## Breaking-change candidates

None.
- The `personOnlyVerdict` and `unattendedPushVerdict` signatures and the `PersonOnlyContext` shape are unchanged (K3's coded throw lives in the emitted guard, not the exported API).
- `CLAUDE_DENY_ROWS` gains a row and loses none. Sync never removes a deny row (`SECURITY.md:98`), so a downgrade leaves the extra row behind, and it refuses only `gh repo unarchive`.
- The `PERSON_ONLY_RULES` change is to the `act` text, not the type.

Confidence: high, `direct` (the exported shapes at `src/hooks/personOnly.ts:50-120` and `:140-210`).

## Unknowns

| Question | Probed | Why not settled | Smallest input that would | Confidence |
|---|---|---|---|---|
| Does wget resolve dot segments before sending? | Codebase only; there are no wget sources in the repo | Tool tier is `codebase`; from memory, wget's `path_simplify` does | One run of the comment's request through wget against a capture server, or reading wget's `url.c` | low, `unverified` |
| Does `gh api` send `..` as written, and does GitHub's API resolve it on its side? | Same | Not checkable here; from memory, Go's `net/http` does not clean request paths | One captured `gh api` request, or reading gh's api command source | low, `unverified` |
| How `gh repo sync` splits local from remote, and how a forced remote sync works (from memory: `merge-upstream`, else a forced ref PATCH) | `brief-R5.txt:13` quotes the manual for the default target and `--force` only | The tier rules out gh's manual and source | The manual page or `gh repo sync --help` text, and gh's sync command source | medium, `unverified` (the comment's quote) |
| Does `gh repo sync` accept `-R`, and does a branch flag value holding `$` occur in practice? | `ghPositionals` (`src/hooks/personOnly.ts:629-637`) | Not in the repo | `gh repo sync --help` output | low, `unverified` |
| Does curl leave percent-encoded dots (`%2e%2e`) unresolved? | `httpCall` decodes before cutting (`:784`) | Not in the repo; K1's two-path fix covers either behaviour | curl's URL-normalizing source or a captured request | medium, `inferred` (the two-path fix covers both readings) |
| Tags in a reftable repository | `scripts.ts:3601` reads reftable for HEAD; `localTags` (`:3622-3651`) reads only `refs/tags/` and `packed-refs` | Adjacent to K3 and outside its contract; it looks like a reftable repository gives an empty tag list | One fixture with a reftable repository and a tag | medium, `inferred` (from `:3601` and `:3637-3646`) |

Sources consulted (all at 20abe813):
- `src/hooks/personOnly.ts`
- `src/hooks/scripts.ts`
- `test/hooks/personOnly.test.ts`
- `test/hooks/personOnlyGuard.test.ts`
- `SECURITY.md`
- `brief-R5.txt`
