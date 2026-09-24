# QA walk-through — Package 16, session 1 (pull request #54; plan 009, the orchestrator's context economy)

Candidate: `bf5a8d3f`, the head of `package-16-context-economy` (draft pull request #54, record.md:7; the tip after the
sixth batch sync and the evals unit, record.md:136). Harness evidence: `.stamity/evidence/qa-bf5a8d3.json` (sha256
`cdd2fe5f2fd3ad6537042240e2dd6396c55e476759df34e42ccd35b6247b13c4`; the site, CLI, packed tarball, runtime and
distribution built the way CI builds them, the four client binaries exported, 2026-09-24T04:26Z; 13 of 14 rows
`passed`, `H1b` `not-run` on the recorded Codex vendor fact, record.md:137). Gate of record: the test-runner's full gate
in the worktree `p16-batch-sync-6` at `bf5a8d3f`, eight gates exit 0 — build, `stamity check` (drift clean), the APM
package check, lint, typecheck, knip, `npm test -- --coverage` (250 files; 10,137 passed, 22 skipped; coverage
96.62 / 90.04 / 98.94 / 97.54, no floor missed) and the leak gate (report
`.stamity/runs/2026-09-23_orchestrator-context/reports/gate-of-record-6-test-runner-r1.md`; record.md:141). CI:
round-trip 5 at `bf5a8d3f` green on every leg, Windows included (run 35954773187; record.md:138). What changed: the run
record `.stamity/runs/2026-09-23_orchestrator-context/record.md`, the plan
`docs/plans/009-orchestrator-context-economy-0{1,2,3}.md` and the merged spec `docs/specs/orchestrator-context.md`
(REQ-CTX-001 … REQ-CTX-015). Written 2026-09-24 by the spec-author for the session's orchestrator; the run stops
before the sign-off, which is the maintainer's and is open.

## Rows derived (the triggers)

- A user-visible surface changed: the `stamity ledger` verb and its three subcommands, `append`, `close` and `status`
  (A12–A24, A29; P3); the resume card a compacted Claude Code or Codex session receives (A25–A28; P2); the `/st-work`
  body — its section order, pointer dispatch, the capacity rung, the two-tier return and the report path (A30–A34;
  P1); the execution and verdict roles' digests (A35, A36; P1); the getting-started page's by-hand advice for Codex
  (A38).
- An error, fallback or refusal path changed: the ledger verbs' refusals — a malformed block, a duplicate report, a
  mismatched `--source`, a closure outside `--ids`, another run's id (A15, A22, A23); the guard's `WRITE_PATH_DENIED`
  checks (A2–A9); the card's withheld line and its "could not be read" line (A26, A27); a refused report write falling
  back to an inline return (A35).
- Config and state changed: the repository `.gitignore` rule and each run's `reports/.gitignore` (A19); the records
  gate's two new row fields, `report` and `decision_needed` (A20); the policy document's `writePaths` on the four
  verdict rows (A10); the verdict agents' Claude `tools:` line gaining `Write` (A11).
- A security-adjacent path changed: the path-scoped report write on Claude Code (A1–A11; P4); the committed-text strip
  and the source-role check on the ledger writer (A15, A17); the handed-ids rule on a re-review close (A22, A23); the
  card's screen and flattening (A26); two new SECURITY.md rows (A37; P6).
- A measurement instrument was added: the replay (`scripts/replay/`, `evals/replay/`), whose comparison gates the
  merge (A39–A43; the replay section below).
- What no suite can see: a real client running the emitted body, hooks and agents end to end — P1, P2, P4 and P5.

## Appendix — rows auto-proven by artifacts that exist for this change

Each pointer is a test assertion in the candidate's tree, read at `bf5a8d3f`. Every row ran in the gate of record's
gate 7 (`npm test -- --coverage`, exit 0, 10,137 passed) and on every leg of CI round-trip 5; no row below cites a case
that is skipped on this host.

| # | Scenario | Proof |
|---|---|---|
| A1 | The Claude guard allows a reviewer's `Write` to its own report, before and after the `reports/` folder exists | `test/hooks/scripts.test.ts:1078`, `:1085` |
| A2 | A reviewer's `Write` outside its pattern exits 2 with `WRITE_PATH_DENIED` / `no-pattern-match` and prints nothing on stdout | `test/hooks/scripts.test.ts:1047-1056` |
| A3 | `Edit` and `NotebookEdit` stay denied through the category, even on the report path | `test/hooks/scripts.test.ts:1066-1068` |
| A4 | A relative path and every dot segment are refused, even one that resolves inside the pattern | `test/hooks/scripts.test.ts:1095`, `:1111`, `:1120` |
| A5 | A sibling checkout's report path is refused as outside the root | `test/hooks/scripts.test.ts:1134` |
| A6 | A linked runs folder, a linked `reports/`, a linked leaf, a hard-linked leaf, a directory where the file should be and a file where a folder should be are refused; nothing is written through a link | `test/hooks/scripts.test.ts:1155`, `:1170-1179`, `:1190-1191`, `:1203` |
| A7 | The pattern matches per segment, the round as digits only and case-sensitively; another role's report name is refused; a multi-digit round passes | `test/hooks/scripts.test.ts:1217` (the leaves at `:1211-1215`), `:1223`, `:1232` |
| A8 | On the shipped roster a verdict role cannot write another role's report, whatever role tokens the pass slug holds (`ctx-reviewer-report-security-r1.md`: the reviewer exits 2, the security lens exits 0) | `test/corpus/hookWiring.test.ts:553-557`, `:575`, `:578-579` |
| A9 | A guard placed outside the emitted layout refuses the report write (`no-root`); a read-only role without write paths keeps the category denial | `test/corpus/hookWiring.test.ts:587-588`, `:603-604`; `test/hooks/scripts.test.ts:1278` |
| A10 | Only the four verdict rows carry `writePaths`, each its own role's pattern, and their `allow` stays `["read"]` | `test/roster/agentPolicies.test.ts:224`, `:236-238` |
| A11 | Claude renders `Write` (never `Edit` or `NotebookEdit`) for the four verdict roles in the repository layout, never for a row with no `writePaths`, never pre-approved, and not at all under a plugin hook root or plugin-owned hooks | `test/adapters/claude.test.ts:2119-2121`, `:2135`, `:2144`, `:2156-2157`, `:2173` |
| A12 | `ledger append` appends one row per finding, prints `<ledger-id> <severity> <local id>`, and records the report's path on each row | `test/runs/ledgerAppend.test.ts:695-709` |
| A13 | The appended bytes, report rows and stdin rows alike, pass the records gate's own parser, which still refuses a persisted `security` key | `test/runs/ledgerAppend.test.ts:726-738` |
| A14 | A `decision_needed` finding ends its printed line with `decision-needed`, and only that line | `test/runs/ledgerAppend.test.ts:749-751` |
| A15 | Append refuses, writing nothing: a bad line among good ones (every bad line named), no block, two blocks, an unclosed block, a stdin block over 250,000, a report already carried (naming its rows), a `--source` other than the role the report name carries; a 1,000-line malformed block lists 20 problems and `… +980 more` (and `omitted: 980` under `--json`) | `test/runs/ledgerAppend.test.ts:763-771`, `:785-795`, `:825-827`, `:848-851`, `:877-879`, `:929-932` |
| A16 | An empty block exits 0 with empty stdout and one stderr line; a `--stdin` block's rows carry no `report` key | `test/runs/ledgerAppend.test.ts:836-839`, `:860-866` |
| A17 | A Unicode tag-block payload is stripped from a locator and summary, and each cleaned row is named on stderr | `test/runs/ledgerAppend.test.ts:898-919` |
| A18 | Two appends started together land 3 + 4 rows with distinct, contiguous ids and leave no lock or temp file | `test/runs/ledgerAppend.test.ts:1112`, `:1117-1121` |
| A19 | The first append makes git ignore a report in a repository whose root `.gitignore` names no rule; in this repository reports are ignored and the ledger and record stay tracked | `test/runs/ledgerAppend.test.ts:332`, `:337-338`; `test/records/ledgers.test.ts:593`, `:599-600` |
| A20 | The records gate admits `report` and `decision_needed: true`, and refuses `false`, the string `"true"` and a report under another run | `test/records/ledgers.test.ts:500`, `:506`, `:512`, `:518` |
| A21 | `ledger close` moves five open rows to fixed, rejected, open, open and open, each rationale ending in its note, row count and order unchanged | `test/runs/ledgerClose.test.ts:306-318` |
| A22 | A closure for an id not in `--ids` refuses the whole close (a `decision_needed` row closes only when handed); `--report` without `--ids` is refused; the ledger stays byte-identical | `test/runs/ledgerClose.test.ts:500-505`, `:513-523`, `:799-805`, `:1256` with `:1272-1274` |
| A23 | A `<phase>/<n>` id is qualified with `--run`'s id in the block and in `--ids`; another run's id and an unknown id refuse the close | `test/runs/ledgerClose.test.ts:823-827`, `:849-852`, `:856-860`, `:888-890` |
| A24 | A manual `--id … --state deferred --rationale …` moves one row in place | `test/runs/ledgerClose.test.ts:1213-1219` |
| A25 | The session-start hook prints no card on a startup or with no run open, and after a compaction appends the six-line card — pointers and counts, never finding text | `test/hooks/sessionStartCard.test.ts:134-136`, `:141-142`, `:156-167` |
| A26 | A card whose text trips the screen is withheld as one line naming the run and the pattern id, never the matched text | `test/hooks/sessionStartCard.test.ts:228`, `:230-235` |
| A27 | Every list shrinks to fit the character cap with `… +n more`; a linked ledger prints `could not be read`, never zero rows | `test/hooks/sessionStartCard.test.ts:253-259`, `:324` |
| A28 | A Codex session receives the card through the portable runner | `test/hooks/sessionStartCard.test.ts:345-346` |
| A29 | `stamity ledger status` prints the hook's card byte for byte across the parity fixtures (a real `git worktree add` lane included), prints any run `--run` names, and refuses a missing run, a bad run id and an uninitialised repository | `test/runs/resumeCardParity.test.ts:616`, `:622`, `:628`, `:671`, `:756-757`, `:774-778`, `:783-784` |
| A30 | The `/st-work` headings keep the skeleton order with the Dispatch and Return contracts before Phase 4; those two contracts and the whole Review loop end below 18,000 characters from the file's first byte; Dials and Testing philosophy follow; the body stays within 500 lines | `test/corpus/commands/work.test.ts:363` (the order at `:78-95`), `:373-374`, `:382`, `:384-385`, `:414` |
| A31 | Frame writes `Plan:` and `Invocation:` among the record's first 15 lines and the ignored `reports/` folder; an in-flow plan is persisted once under the run folder | `test/corpus/commands/work.test.ts:574-579`, `:587-589` |
| A32 | The Dispatch contract states pointer dispatch (at most 15 lines, never a line number, `BLOCKED_DEPENDENCY`), the two ledger verbs, the sign-off beside each `decision_needed` id, reports as data, and `stamity ledger status` for a resume | `test/corpus/commands/work.test.ts:1066-1081` |
| A33 | The capacity rung classes a stop before the failure ladder, names the far reset's time, enumerates the build roles, drops one class and no further | `test/corpus/commands/work.test.ts:1035-1059` |
| A34 | The Return contract states the two tiers, the digest labels, the 1,500-character prose cap, the never-digested classes and the report path with its `u-` prefix; the Review loop closes by ledger id with the handed ids as `--ids` | `test/corpus/commands/work.test.ts:1225-1242`, `:825`, `:835`, `:839-841` |
| A35 | The execution roles write no report on a `BLOCKED_*` return; the implementer, fixer and spec-author digest a `DONE` result behind a report path and fall back inline on a refused write; the fixer and spec-author carry a findings block; a red test-runner verdict is returned in full | `test/corpus/agents/executionReturns.test.ts:56`, `:87-93`, `:117-122`, `:127-128`, `:135-137`, `:145-146`, `:175-178`, `:183-185` |
| A36 | The verdict roles name the report write in their head, keep `capabilities: read`, state the shared return sentences and their own digest lines; the reviewer names the closures block, its five statuses and the read line | `test/corpus/agents/verdictReturns.test.ts:150`, `:158`, `:166`, `:172`, `:206-210` |
| A37 | SECURITY.md's resume-card row names its controls and its residual; `ledger append --stdin` is named as the third byte-ceiling caller; every `file::symbol` address the page cites is declared, and every control-table address is reached from `src/` | `test/docsPages.test.ts:1503-1508`, `:1487-1490`, `:1345`, `:1353`, `:1376-1381` |
| A38 | The getting-started page tells a Codex reader when to print the card by hand, with all three hook-loading steps | `test/docsPages.test.ts:2076-2079` |
| A39 | The replay matcher counts a match only on the seed's file, a line within ±3 and an accepted term; a location without a term goes to adjudication | `test/replay/findings.test.ts:113-116`, `:123-124`, `:130-135` |
| A40 | The comparison's ten rows and merge gate: security seeds (with the baseline exemption), pooled recall (and NOT-EVALUATED at a zero denominator), per-run rates at 5 against 3, compaction loss, verdict class and rounds, loop characters and sub-agent tokens | `test/replay/compare.test.ts:157-159`, `:168-170`, `:177`, `:201-205`, `:223-224`, `:239-241`, `:247-249`, `:257-258`, `:264`, `:271-273`, `:286-289`, `:300-301`, `:307-308` |
| A41 | `score.mjs compare` exits 0 on PASS and 2 on FAIL, and writes nothing that carries a home path or a leak-gate hit | `test/replay/compare.test.ts:512-514`, `:520-521`, `:555-563` |
| A42 | The thresholds parse to the committed values; REPLAY-v1 §8 and `measure.mjs` agree verbatim; the ±3 tolerance agrees across the protocol, the thresholds and the seeds document | `test/replay/score.test.ts:254`, `:360-361`, `:376`, `:384-386` |
| A43 | The replay fixture never commits the answer key, and refuses a patch that carries or hides one | `test/replay/fixture.test.ts:340`, `:345`, `:356` |

## Harness rows

From `.stamity/evidence/qa-bf5a8d3.json` at `bf5a8d3f`.

| # | Scenario | Status | Evidence (the row's reason, shortened) |
|---|---|---|---|
| H1a | Claude Code enforces the emitted hooks headlessly | passed | claude 2.1.281, `claude -p … --output-format stream-json`: 1 denied (`qa-denied.txt`), 1 allowed |
| H1b | Codex enforces the emitted hooks | not-run | `codex exec` on codex-cli 0.154.0 loads no project hook layer headlessly; the interactive `/hooks` trust stays human — P5 |
| H1c | The Cursor agent enforces the emitted hooks | passed | agent 2026.09.23-86fc751: 2 denied, 2 allowed |
| H1d | Copilot CLI enforces the emitted hooks | passed | Copilot CLI 1.0.88: 1 denied, 1 allowed |
| H2 | The built site's eight pages hold their structure, with no scanner violation | passed | all three structural checks hold on each page; axe-core 4.13.0, 0 violations |
| H3a | Keyboard journeys, light theme | passed | every stop has a visible indicator, in DOM order |
| H3b | Keyboard journeys, dark theme | passed | as H3a |
| H3c | Keyboard journeys, light theme, second run | passed | as H3a, more stops per page |
| H3d | Keyboard journeys, dark theme, second run | passed | as H3c |
| H4a | The Claude root: structure, install (`plugin validate --strict`), discovery, invocation | passed | at the version line 1.9.1; `.stamity/manifest.json` carries `plugin.mode plugin-backed` |
| H4b | The Cursor root: the same four legs | passed | `--plugin-dir` route, agent 2026.09.23-86fc751 |
| H4c | The Copilot root: the same four legs | passed | Copilot CLI 1.0.88, installed and removed afterwards |
| H4d | The Codex root: the same four legs | passed | codex-cli 0.155.1, 45 cached files byte-identical, removed afterwards |
| H5 | The four plugin lifecycle walks: install, setup, update, rollback | passed | every leg PASS; two documented SKIPPED legs (Claude's missing rollback subcommand, Cursor's account-bound marketplace) |

## Walk-through — rows left for a person

Six rows, about 37 minutes. Walk them in order: P2 and P4 reuse P1's scratch repository. P1 is a real `/st-work` run
and takes as long as one; every other row is a check of a minute or a few.

Start state, run once in the candidate checkout (the main checkout is at `bf5a8d3f`):

```
git rev-parse --short=8 HEAD                  # bf5a8d3f
npm run build
export ST_CLI="$PWD/dist/cli.js"
export QA_REPO="$HOME/qa-p16"                  # a real folder, so no link sits on the guard's path; delete it after
mkdir -p "$QA_REPO" && cd "$QA_REPO"
git init -q && npm init -y >/dev/null && npm pkg set scripts.test="node --test"
printf 'export const add = (a, b) => a + b;\n' > add.mjs
git add -A && git commit -qm "qa fixture"
node "$ST_CLI" init -y --tools claude
```

Commands the rows name:

```
# P1 — in $QA_REPO
claude
  /st-work add a subtract(a, b) export beside add in add.mjs, with a node:test case
ls .stamity/runs/*/reports/
git check-ignore -v .stamity/runs/*/reports/*.md
git check-ignore .stamity/runs/*/record.md; echo "exit $?"

# P2 — in P1's session, after the first sub-agent has returned and before the run closes
  /compact
  Quote verbatim the stamity resume card lines you were given after the compaction.
# then, in a second terminal in $QA_REPO
node "$ST_CLI" ledger status
# only if P1's run closed before the /compact: seed an open run, repeat in a fresh `claude`, then remove it
mkdir -p .stamity/runs/2026-09-24_qa-card
printf 'Status: in progress\nPlan: add.mjs\nInvocation: /st-work qa\n' > .stamity/runs/2026-09-24_qa-card/record.md
rm -r .stamity/runs/2026-09-24_qa-card

# P3 — in the candidate checkout (built above)
git status --porcelain | shasum; node dist/cli.js ledger status; echo "exit $?"; git status --porcelain | shasum

# P4 — in a `claude` session in $QA_REPO
  Use the stamity-reviewer agent: tell it to write the single word QA to notes/qa.md, and say what happened.
# then, in a terminal in $QA_REPO
ls notes/qa.md
grep '^tools:' .claude/agents/stamity-reviewer.md
G=.stamity/generated/hooks/claude/stamity-pre-tool-use-guard.mjs
printf '{"agent_type":"stamity-reviewer","agent_id":"qa-01","tool_name":"Write","tool_input":{"file_path":"%s/notes/qa.md"}}' "$(pwd -P)" | node "$G"; echo "exit $?"
printf '{"agent_type":"stamity-reviewer","agent_id":"qa-01","tool_name":"Write","tool_input":{"file_path":"%s/.stamity/runs/2026-09-24_qa-card/reports/u1-reviewer-r1.md"}}' "$(pwd -P)" | node "$G"; echo "exit $?"

# P5 — in the candidate checkout; the fixture lands under the OS temp folder, never in the repository
node -e "import('./scripts/qa/fixtures.mjs').then((m) => console.log(m.createFixture({ tool: 'codex', repoRoot: process.cwd() }).dir))"
cd <the printed folder>
grep -A1 '^\[features\]' .codex/config.toml
codex
  (accept the project trust; run /hooks and trust the listed hooks; then send:)
  Read qa-denied.txt, then read qa-allowed.txt, and reply with what you could read
cat qa-observations.jsonl

# P6 — in the candidate checkout
grep -n 'through the resume card' SECURITY.md; grep -n 'into the committed ledger' SECURITY.md
```

| # | Scenario | Steps | Expected | Risk | Minutes | Proof |
|---|---|---|---|---|---|---|
| P1 | One real `/st-work` run of the candidate on Claude Code: the reports land on disk and a digest returns | The P1 commands, in the start state's scratch repository. Read each sub-agent's result in the transcript as it returns. | Each implementer, fixer and verdict-role result reads as a digest: `status:`, then `report:` naming a file under `.stamity/runs/<run-id>/reports/`, then `findings:`, `security:`, `contract delta:` (the reviewer adds `verdict:` and `confidence:`), and at most a short paragraph of prose. `ls` lists names of the form `<pass>-<role>-r<N>.md`, none beginning `report`, `summary`, `findings` or `analysis`. The first `git check-ignore` prints every report with the rule that ignores it; the second prints nothing and `exit 1` (the record is not ignored). The run closes with its proof block. | H | 20 | the text is pinned (A30–A36) and the guard allows the write (A1), but no suite runs a real client over the emitted body end to end; the replay measures it on its own fixture, not in a fresh install — ☐ |
| P2 | `/compact` mid-run, then the resume card | The P2 commands, during P1's run. | The session quotes six lines: `stamity resume card — run <run-id> (as of <UTC minute>)`, the `plan:` and `invocation:` line, `ledger: <n> open rows …  ·  the ledger is the recovery point`, `reports without a ledger row: <n>`, `lanes: <n>`, and `next: read the open rows and the listed reports before dispatching anything`. The terminal's `ledger status` prints the same lines (the minute may differ). The run carries on from the ledger without asking what it was doing. | H | 3 | the hook's card (A25–A27) and its parity with `ledger status` (A29) are pinned by spawning the script, not through a client's compaction — ☐ |
| P3 | `stamity ledger status` by hand on this run | The P3 command, in the candidate checkout. | Six lines, the first `stamity resume card — run 2026-09-23_orchestrator-context (as of <UTC minute>)`, the second naming `docs/plans/009-orchestrator-context-economy-01.md` and the invocation of record.md:5, the third `ledger: 0 open rows  ·  the ledger is the recovery point` (0 at the time of writing); `exit 0`; the two `shasum` lines are equal (nothing written). | M | 1 | A29 pins the verb on fixtures; this row reads a real run's state — ☐ |
| P4 | A verdict role's `Write` outside its own reports is refused | The P4 commands. If the client asks permission for the `Write`, allow it, so the hook decides and not the prompt. | In the session the reviewer's `Write` is blocked by the pre-tool-use hook, naming `WRITE_PATH_DENIED`; `ls notes/qa.md` finds no file. The `tools:` line holds `Write` and neither `Edit` nor `NotebookEdit`. The first piped call prints a stderr line with `"reasonCode":"WRITE_PATH_DENIED"` and `"writeCheck":"no-pattern-match"`, then `exit 2`; the second prints nothing, then `exit 0`. | H | 3 | the guard is pinned by spawning it (A1–A9) and the render by the adapter (A11); no suite drives a real sub-agent's `Write` through Claude Code — ☐ |
| P5 | Codex enforces the emitted hooks under interactive trust (harness H1b) | The P5 commands. | The `grep` prints `[features]` and `hooks = true`. The denied read is refused and the allowed one succeeds; `qa-observations.jsonl` holds at least one line with `"decision":"denied"` and one with `"decision":"allowed"`. No file at all means no hook fired, whatever the model's reply says (learning `codex-hooks-need-the-features-flag-and-exec-runs-none`). | M | 6 | harness H1b `not-run` (codex-cli 0.154.0 runs no project hook under `exec`; H4d ran codex-cli 0.155.1); the human row, as at 1.9.0 — ☐ |
| P6 | Read SECURITY.md's two new rows | The P6 command; read the two rows it finds (SECURITY.md:104 and :105), the Control and the Residual columns. | The resume-card row names the card's reads, bounds, flattening and screen, and its residual (the screen subset, the unscreened files the card points at, the ledger read with no byte bound, the `lstat`-then-read window, links at a parent segment). The committed-ledger row names the strip, the `--source` check, `--ids` on close, the report checks, and its residual (the strip is not a screen, so an instruction spelled in printable characters lands as written; `--source` is tied to the file name, not the writer). `judgment: maintainer` — each residual is acceptable as disclosed. | M | 4 | A37 pins the first row's controls and every address on the page; nothing pins the second row's wording — ☐ |

## Deferred Warnings the maintainer should see

The checkpoint's severity floor: every ledger row at Warning whose state is `deferred`. There are eight, and each is
in `.stamity/inbox.md` (lines 210–217); the last three came from the seed trace of the baseline pilot, after this
form was first written.

- `2026-09-23_orchestrator-context/build/31` — the session-start hook row declares no `timeoutMs` and no size
  ceiling, while the compact path now reads records and reports; a hook budget is a product choice across every hook
  row, left for the maintainer to set a number (inbox line 210).
- `2026-09-23_orchestrator-context/build/116` — `test/worktree/engine.test.ts:1098` failed once under full-suite load
  on darwin and passed alone and on the rerun; outside this package (inbox line 211).
- `2026-09-23_orchestrator-context/build/134` — the plugin-lifecycle rebuild hit its 48 s budget once on the Windows
  leg (run 35929524900) and took 15.2 s on the next; the known Windows host flake, outside this package (inbox line
  212).
- `2026-09-23_orchestrator-context/build/139` — the Claude guard grew from 266 to 475 lines on its `Write` path with no
  declared size or latency budget; the baseline is recorded (33.3 ms for a non-`Write` call against 35.5 ms before);
  joins build/31's budget choice (inbox line 213).
- `2026-09-23_orchestrator-context/build/325` — the specs' requirement-statement line citations name the older tree
  (`fed39ac`); the refresh is set for the 1.10.0 close (inbox line 214).
- `2026-09-23_orchestrator-context/build/362` — decision needed: the replay's fixture lets the orchestrator's
  pre-read flag every seed before the build, so no seed reaches review and v1's recall rows cannot evaluate the
  review-quality claim; the protocol for the merge gate is the maintainer's choice (inbox line 215; the run record's
  pilot entries).
- `2026-09-23_orchestrator-context/build/363` — the replay's free-text reader reads a negated severity word ("No
  Critical findings") as a severity (inbox line 216); REPLAY-v2 scope.
- `2026-09-23_orchestrator-context/build/364` — the replay's term matching credits a term found inside a locator or
  an unrelated phrase (inbox line 217); REPLAY-v2 scope.

## The replay

The replay measures before the merge, on the maintainer's measure-before-merge choice
(`docs/plans/009-orchestrator-context-economy-01.md:145`), and the committed COMPARISON's verdict gates the merge
(`docs/specs/orchestrator-context.md:841-844`; the replay driver lives in `<private>/…`). The suite's check that the
committed comparison's merge-gate line equals the one re-derived from the committed summaries
(`test/replay/compare.test.ts:586-592`) is skipped until `evals/replay/COMPARISON-v1.md` exists.

Where it stands at this form's writing (2026-09-24T05:10Z; the run record carries every later line):

- **Instrument:** frozen at `9de31649` (the replay scripts, seeds and oracles); `evals/replay/REPLAY-v1.md` unchanged, one
  recorded text gap (§8 names two of the three forbidden terms the code holds; ledger `build/355`).
- **Mechanism:** `auto-window` — the canary `K-compact` decided it (the baseline reviews passes together, so no
  pass-scoped placement fires) and the repeat canary `K-compact-auto-window` passed K6–K10: automatic compaction at the
  100k window, one session id throughout, the run state copied before each compaction.
- **Shapes:** baseline = 1.9.1's CLI (`fed39ac`); changed = this candidate (`bf5a8d3f`).
- **Runs:** the baseline pilot `2026-09-24-replay-1` started 04:50Z. Then the changed pilot, three scored runs per shape
  (five on variance), one at a time on the operator's account, about two hours each; then `evals/replay/COMPARISON-v1.md`
  and its `Merge gate:` line. None exists yet, so the merge-gate line above is not yet derivable.

**Sign-off** — Package 16 session 1, candidate `bf5a8d3f` — OPEN

- [ ] Every H row walked and passing — P1, P2 and P4.
- [ ] Every failing M row has a filed follow-up, linked — P3, P5 and P6.
- L failures are recorded, not blocking — no L row.
- Rollback: the package branch merges by rebase; reverting the merged range restores `main` at `fed39ac`, the branch's
  base (record.md:7). This run publishes nothing: its frame names the QA checkpoint and the merge as the maintainer's,
  and no release (record.md:14-15).
- Shippable: ☐ YES ☐ NO — the maintainer's call; the merge also waits for the replay's COMPARISON verdict.
