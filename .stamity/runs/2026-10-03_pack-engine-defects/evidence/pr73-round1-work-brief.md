<!-- Preserved 2026-10-03 by run 2026-10-03_pack-engine-defects. A copy of the work brief that
.stamity/runs/2026-10-01_pr73-review-round-1/record.md and plan.md cite at a session scratch path a reboot deletes; that
record is read-only to later runs, so its copy lives here. One change: the local checkout path on line 3 of the
original reads <the public checkout> here. -->
# PR #73 · round 1 · accepted findings for `/st-work`

Repository: <the public checkout>, branch `docs/plans-015-016` (PR #73), head `4607ba7d`.
The change is documentation only: three `/st-plan` files for future packages. Nothing in them is built; no source,
test or content file changes. Every fix below edits plan text so the executing run of that plan does not build the
defect. Line numbers are at `4607ba7d`; apply edits by their quoted anchors (or bottom-up), because earlier edits
shift later lines. Fix sketches come from the evaluation researchers; each was read against the file at HEAD.

## Units (file-disjoint — one writer per file)

- **U1** · `docs/plans/015-board-writes.md` · F01, F02, F03, F04, F05, F06, F07, F09
- **U2** · `docs/plans/016-fork-distribution-02.md`, plus the one census row at `docs/plans/016-fork-distribution-01.md:896` · F11, F12, F13, F14
- **U3** · `docs/plans/016-fork-distribution-03.md` · F16, F17, F18, F19, F20, F21

Declined, no edit: F08, F10, F15, F22. Not touched: `docs/specs/board-writes.md` (headings only), `.stamity/inbox.md`.

Interacting fixes inside one unit (apply together): F01+F03 (pickup-preview sentence), F01+F02 (progress table),
F06+F07 (contract opening / New item write), F05+F09 (GitHub notes paragraph), F11+F12 (`u2-upgrade-verb` cells),
F17+F20 (the reset block), F19+F21 (step-14 paragraph).

## U1 · plan 015

**F01 (comment 4161202215) — checklist ticks in the pickup preview.** The progress table (`:473-474`) maps
`criterion.done` to a progress comment plus an item edit ticking the criterion, but the pickup preview (b1 text 9,
`:357-359`) and REQ-BOARD-002's body (`:126-127`) list only progress comments, the PR mention and (with `--move`) status
changes, and the preview rule (`:439-440`, REQ-BOARD-002 `:125-126`) forbids an unlisted write. Fix: add "a tick of each
acceptance criterion the run verifies, where the item's body lists it as a task" to the pickup preview's list in b1 text 9
and REQ-BOARD-002's body; extend REQ-BOARD-001 (`:102-103`) to "Progress comments, checklist ticks and PR mentions from
`/st-work` events are written without `--move`"; extend REQ-BOARD-002 criterion 2 (`:132-133`) and its b1 test pin so
ticks are asserted as named.

**F02 (4161202230) — phase comments under `move: off`.** Decision 4 (`:55-56`) and REQ-BOARD-003 (`:144-145`) say that
without `--move`, `phase.transition` and `run.terminal` map to progress comments; the `phase.transition` cell (`:472-473`)
carries only a `move: on` status transition. Fix: the cell becomes "status transition, where the phase map carries the
phase and the handoff carries `move: on`; otherwise a progress comment naming the phase"; REQ-BOARD-003 criterion 2
(`:155-156`) gains "…and both cells name a progress comment under `move: off`"; the b1 test pin (`:452-476`/`:498-508`)
gains the matching assertion.

**F03 (4161202236) — the second consent.** The pickup preview says one `apply` covers "the status changes" with "no
further prompt" (`:357-359`, `:126-127`, `:437-438`, `:123-124`), while the `--move` section (`:444-447`, REQ-BOARD-003
`:147-149`), Decision 5 (`:59-60`) and the maintainer's walk (`:40`) ask a close, reopen or backward move once at the end
of the run. Fix: in b1 text 9 and REQ-BOARD-002's body the item becomes "with `--move` the forward status changes", plus
"a close, a reopen or a backward transition a work event produces is not covered: it is asked once at the end of the
run"; in `### The preview` (`:437-438`) and REQ-BOARD-002 (`:123-124`), after "no further prompt" add "except the
end-of-run question `--move` defines"; REQ-BOARD-002 criterion 2 (`:132-133`) and its b1 test pin the exclusion.

**F04 (4161202242) — sync order.** `b4-eval-cases` edits `.stamity/overrides/skills/st-eval-run/SKILL.md`, the source of
the tracked `.claude/skills/st-eval-run/SKILL.md` (`.stamity/manifest.json:315-321`), but `b6-dogfood-sync` depends only
on b1–b3 (`:569`, `:578`) and does not list that file (`:565`). Fix: add `b4-eval-cases` to b6's `depends_on` (`:569`)
and to Execution order step 4 (`:578`, "after `b1`, `b2`, `b3` and `b4`"); add `.claude/skills/st-eval-run/SKILL.md` to
b6's `files` (`:565`).

**F05 (4161202263) — listing limits.** The `--limit` rule (`:395-396`; REQ-BOARD-007 `:236-239`, criterion 2
`:244-245`) covers only `gh issue list`; measured on gh 2.86.0, `gh project item-list` and `gh project field-list`
default to 30. Fix: b1 text 13 (`:395-396`) becomes "`gh issue list`, `gh project item-list` and `gh project field-list`
each return 30 unless told otherwise, so a listing the run depends on passes a `--limit` above the count it lists (or
pages the GraphQL `items`/`fields` connection)"; mirror it in REQ-BOARD-007's body (`:238-239`); extend criterion 2
(`:244-245`) and its b1 test pin; add a clause to the Risks row at `:613`.

**F06 (4161202271) — repository-only fills.** The canonical New item write (`:413-414`) adds the issue to "the linked
project" unconditionally; b1 text 7 (`:348-349`) and REQ-BOARD-001 (`:99-100`) say "when one is linked". Fix:
`:413-414` → "added to the linked project when one is linked".

**F07 (4161202312) — the destination repository.** A link made by a `--source` that names a Projects board names no
repository (`:97-98`, Decision 1 `:46-48`, b1 text 5 `:340-341`, contract `:409-411`), while `fill` files "in the linked
repository" (`:99`, `:349`, `:413`) and the floor forbids writing to any repository but the linked one (`:167-168`,
`:428`); `gh issue create` without `-R` uses the checkout's repository. Fix (the recommended default, taken overnight):
in Decision 1, REQ-BOARD-001, b1 text 5 and the contract opening, state that a link to a Projects board also names the
repository new items are filed in — from setup step 2 or from a `--source` that names it; with no repository named,
New item rows stay proposals (`BLOCKED_DEPENDENCY` naming the missing repository) while edits, comments and moves on
existing items proceed. Add a REQ-BOARD-001 corpus criterion and a b1 test pin for that sentence.

**F09 (4161202324) — write access.** Setup step 1 (`:373-376`; REQ-BOARD-007 `:233-234`) checks only authentication
and scope. GitHub silently drops labels on issue create without push access (REST "Create an issue"), and
`ProjectV2.viewerCanUpdate` reports project write access (GraphQL reference) — both accessed 2026-10-02. Fix: in b1 text
11 setup step 1 and REQ-BOARD-007, setup reads the acting account's own repository permission (the endpoint the plan
already names at `:188`/`:458`) and requires `admin` or `write`, and for a Projects board requires `viewerCanUpdate`;
if either fails the board is linked read-only and every write stays a proposal, naming the failed check. Add the GraphQL
viewer check to the GitHub row's `gh api` list (`:390`) and the notes paragraph; extend REQ-BOARD-007 criterion 3
(`:247-248`) and add a b1 test pin.

## U2 · plan 016 file 2 (plus one row of file 1)

**F11 (4161202253) — no shell for `upgrade`.** `u2-upgrade-verb` spawns `<cmd>.cmd` with `shell` on win32 and claims
every argument is validated (`:954`, Spawn), but step 4 appends `--registry` from `publishConfig.registry`, checked only
as non-empty (`src/cli/kit/packageName.ts:100-110`), and the test pins `shell: true` (`:955`); the repo's `runNpm` runs
npm's JS entry through `process.execPath` with no shell (`scripts/plugins/runtime.mjs:226-273`). Fix: Spawn → production
`exec` runs `process.execPath` with npm's JavaScript entry (`npm-cli.js` for `npm`, `npx-cli.js` for `npx`), found the
way `runNpm` finds them, `shell: false` on every platform; only if both probes miss, fall back to the `.cmd` form and
refuse a `registry` that does not parse as an `http:`/`https:` URL or contains a space or one of `&|<>^%"`. Validate
`registry` as a URL up front (`VALIDATION_ERROR` before any exec). testCriteria (`:955`): replace the `shell: true`
check with (a) the exec builder spawns `process.execPath` with the JS entry and `shell: false` whenever an entry resolves,
(b) with no entry on `win32`, a registry containing `&` or a space exits 1 before any exec. Files (`:953`): add the
probe's source (import from runtime.mjs, or a shared module with its `PLAN_MAP` row).

**F12 (4161202297) — prepare the pin first.** Step 7 runs the real sync; step 8 then finds the pin by a first-match text
search (the `retargetPreset` technique, `scripts/fork-identity.mjs:208-213`), whose refusal is only safe before any write.
Fix: a new step between 5 (preflight) and 6 (dry-run) reads `package.json`, locates the dependency by its key under
`devDependencies`/`dependencies`, builds the edited text and re-parses and compares it; on failure `VALIDATION_ERROR`,
exit 1, before any sync; step 8 writes only the prepared text; `--dry-run` reports the prepared pin. testCriteria
(`:955`): add "given a `package.json` whose `version` is `"1.12.0"` before `devDependencies["@zomarit/stamity"] =
"1.12.0"`, the upgrade moves only the dependency value, or refuses before the apply exec — `exec` called twice (view,
preflight) and no writes". edgeCases (`:956`): add "pin present but cannot be rewritten in place".

**F13 (4161202306) — the legacy admin template.** The census row (`:1230`) says "no `admin/claude-managed-settings.json`",
against S3 (`:73`), REQ-PLUGIN-036 (`:587-588`, `:602-603`) and `u2-admin-templates` (`:1045-1046`). Fix: replace it with
"`admin/claude-managed-settings.json` kept as a byte copy of `admin/claude/managed-settings.tag.strict.json` until the next
major release (S3)"; keep the consumers column.

**F14 (4161202343) — the APM lock contract.** File 2 assumes `src/apm/lockfile.ts` with `state`/`message`, `repoUrl:
string`, `key`, `virtualPath`, `version` and a `deployments[]` fallback (`:1058`); file 1 declares `src/detect/apmLock.ts`
with `kind`/`detail`, `refusedPaths`, `repoUrl: string | null` and none of the others (`016-fork-distribution-01.md:743`,
census `:896`); `u2-apm-backed-mode`'s files (`:1057`) omit the module; file 2's census (`:1219`) credits u1 with fields it
does not declare. Fix (recommended ownership, taken overnight): at `:1058` replace the "Assumed from …" block with file
1's actual contract plus an explicit additive extension owned by `u2-apm-backed-mode` — `ApmLockDependency` gains
`virtualPath: string | null` and `version: string | null`; `parseApmLock` falls back to the top-level `deployments[]`
values when a dependency has no `deployed_files`; drop `key`; the `dependency` formula handles a null `repoUrl`. `:1057`
files: add `src/detect/apmLock.ts` and `test/detect/apmLock.test.ts`. `:1059` testCriteria: a 0.32.0 lock with only
`deployments[]` gives the same `apmDeployedPaths` as one with `deployed_files`; the 0.29.0 lock still reads `[]`.
`:1071` (`u2-apm-floor-current`): `<message>` → `<detail>`. `:1219` census producer → "u1-foreign-paths (base);
u2-apm-backed-mode (additive: `virtualPath`, `version`, `deployments[]` fallback)". File 1 `:896`: name the extension as a
known consumer change.

## U3 · plan 016 file 3

**F16 (4161202197) — `failed` legs hold the release (narrowed).** The escape "open leg + recorded decision"
(`:799-800`, `:820`, `:913-914`) does not separate `failed` from `not-run`, against REQ-PLUGIN-044's criterion
(`:180-181`). Fix: `:799-800` → "exits 0 on the release candidate — or, with no leg `failed`, each `not-run` leg carries
the maintainer's recorded decision"; `:820` the same; `:913-914` → "an open non-live leg that is `not-run` is one
question to the maintainer (…default: hold); a `failed` leg holds the release and is fixed through the normal loop";
the testCriteria case at `:737` that pins the checklist line also requires the word "`failed`". A `not-run` leg may
still ship named under `Not done:` (REQ-PLUGIN-044 `:178-179`; invariant 4).

**F17 (4161202205) — a two-block reset.** One fenced `sh` block (`:617`, `:621-659`) runs the step-6 Actions-on call and
`status` right after the push; the comment does not pause it; the test (`:673-680`) inserts the merge at a split.
Fix: two fenced `sh` blocks. Block 1 runs steps 1–5 and ends by printing `$RESET_COMMIT`. Block 2, labelled "run after
the pull request lands with a merge commit", starts with `set -euo pipefail`, `STAMITY_DOWNSTREAM=…` and
`RESET_COMMIT='<printed sha>'`, then the guard `git fetch origin main && git merge-base --is-ancestor "$RESET_COMMIT"
origin/main || { echo "land the stamity-reset pull request first" >&2; exit 1; }`, then the Actions-on call and
`status`. Also: `:617-619` → "two fenced `sh` blocks"; `:672-680` the test extracts the first and second `sh` blocks
(not a split at `# 6.`), asserts block 2 holds the guard plus the two lines, and adds a red case (block 2 run before the
merge exits 1 and the `gh` stub log shows no Actions-on call); `:597` testCriteria (e)/(f) rephrased for block 2; `:661`
provenance line under each block.

**F18 (4161202278) — the promotion tag.** `:934` "for tag `v1.12.0`" → "for tag `plugins/v1.12.0`"
(`promote-channel.mjs` accepts only `releaseTag(identity, v)`, `016-fork-distribution-02.md:1032`; pattern
`plugins/v<version>`, `package.json:50`).

**F19 (4161202287) — the full pack invocation.** `:937-939` lacks `--repo` (required, `scripts/evidence-archive.py:509-517`),
and one manifest path for every run fails on the second (`evidence-archive.py:312` refuses an existing output). Fix: the
invocation becomes `python3 scripts/evidence-archive.py pack --repo <checkout> --ref <full sha of the commit carrying
evals/runs/<run>: the records-branch commit after plan 014 file 2> --path evals/runs/<run> --repository zomarit/stamity
--output <tmp>/<run>.tar.gz --manifest <tmp>/<run>.ARCHIVE.json --url <release asset url>`, plus a clause that each
manifest is then placed as `evals/runs/<run>/ARCHIVE.json` (on `records` after plan 014).

**F20 (4161202330) — keep fork-owned tags.** `:650-655` deletes every origin `plugins/*` tag without a `-`, so a fork's
unsuffixed release tag is lost. Fix: replace with an object-id match against upstream — read
`git ls-remote --refs --tags upstream 'refs/tags/plugins/*'` and delete an origin tag only when upstream has the same ref
name at the same object id; drop the `*-*` case. Also `:598` (edge case) and `:999` (risk row) → "every tag whose object
differs from upstream's"; add testCriteria (h) at `:597`: a fixture tag `plugins/v1.0.1` on a fork-built orphan commit
(subject `plugins: v1.0.1 from <fork commit>`) survives; the test prose at `:680-681` gets that fixture.

**F21 (4161202336) — commit messages.** `:901` → `node scripts/records.mjs commit -m "records: the 1.12.0 measurements
snapshot"`; `:941` → `node scripts/records.mjs commit -m "records: the 1.12.0 release close"` (grammar
`commit -m <msg> [--dry-run] [--allow-deletions]`, `docs/plans/014-lean-repository-02.md:162`).
