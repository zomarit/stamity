# Run 2026-10-11_debug-claude-plugin-walk — the live Claude plugin walk, red since client 2.1.291

Status: closed 2026-10-11 — diagnosed (`--diagnose`): the walk is wrong, the client's update is not; residue 0
Plan: none — debug round
Invocation: /st-debug --diagnose The live Claude plugin walk in test/ci/pluginLifecycle.test.ts, red since Claude Code 2.1.291 (installed now: 2.1.296): after `claude plugin update` reports the update, `claude plugin list` still shows the old fixture. Question to settle: does the update itself fail, or does only the list lag? A wrong walk is fixed in the 1.14.0 release PR and armed; a client bug keeps STAMITY_CLAUDE_BIN unset in CI with a dated reason, an inbox row and a line in the release notes. Run the walk alone (it is a live client check; no eval run, full suite or site build beside it). Its inbox rows: 2026-10-08_product-core/build/2, 2026-10-08_maintainer-tooling/build/11, review/13. Unattended: no question mid-run; take the recommended default and list it for the morning.
Opened: 2026-10-11T19:25Z

Target: app code (a failing product test). Route: in-process — the tree already carries the failing test (the armed
walk) and the test gate is runnable here. `--diagnose`: the run stops once the cause is named; steps 6 and 7 do not
run, step 8 does.

## Marker check at the start (2026-10-11T19:25Z)

Two hits, both quoted scenario text in closed runs' QA tables (row P24 in `2026-09-30_optimization-sweep/qa.md:181`
and `2026-09-30_release-1-11-0/qa.md:296`, the row that tests this very check with a made-up run id). Neither is a
probe; both stay. Hits carrying this run's id: 0.

## Round 1

### Hypotheses (step 1)

The symptom: at `test/ci/pluginLifecycle.test.ts:1067`, in the rollback part of the walk — after the update to the
second fixture version, the source moved back to the first tag, `marketplace add` and the documented re-install —
`claude plugin list` is expected to contain the second version and does not.

1. **H1 — the list reports the source directory, not the record.** On a directory marketplace the client reads the
   plugin in place, and `plugin list` prints the version it finds in the source directory, which the walk has just
   moved back to the first tag. The update worked. Separating observation: the list right after the update, with the
   source still at the second tag, shows the second version, and shows the first only once the source moves back.
2. **H2 — the update does not record the new version.** It reports `updated` and fills the cache, but the installed
   record stays at the first version. Separating observation: the record on disk right after the update.
3. **H3 — the list lags behind the record** (a cached listing). Separating observation: the record names the second
   version while the list shows the first with the source still at the second tag, and a later list catches up.
4. **H4 — only the list's text changed.** Separating observation: `plugin list --json` carries the second version
   while the text does not.

### Reproduce (step 3) — the armed walk, twice, alone

- test-runner, main checkout at `751aaa5e`, client `2.1.296`, only the Claude walk armed
  (`env -u STAMITY_CURSOR_BIN -u STAMITY_COPILOT_BIN -u STAMITY_CODEX_BIN npx vitest run test/ci/pluginLifecycle.test.ts`):
  run 1 exit 1 (1 failed, 28 passed, 3 skipped; 77.99 s), run 2 exit 1 (the same counts; 65.25 s). Both fail at
  `test/ci/pluginLifecycle.test.ts:1067:49`, `expected … to contain '1.9.0-fixture.2'`, and the received list is the
  same but for the temp path:

  ```
  Installed plugins:

    ❯ stamity@stamity
      Version: 1.9.0-fixture.1
      Read from: <the walk's temp directory>/mirror/claude
      Scope: project
      Status: ✔ enabled
  ```

  The walk's own rows before the stop: `install PASS`, `setup PASS`, `status-installed PASS`, `no-auto-update PASS`,
  `update PASS (plugin update --scope project to 1.9.0-fixture.2 after the source moved)`, `status-updated PASS
  (compatible at 1.9.0-fixture.2)`, `rollback-subcommand SKIPPED`. The assertions at `:1059-1064` passed in both runs:
  the re-install's JSON reported `installedVersion` the second version and `availableVersion` the first.
- A failure for the stated reason on two consecutive runs: the reproduction holds.

### What the reproduction already says (step 4, first reading)

- The update is recorded: the re-install reads the installed version as the second one (`:1061`), and the cache holds
  the second tree byte for byte (`:1034`). H2 does not survive.
- The list's `Read from:` line names the source directory (`mirror/claude`), which stood at the first tag when the
  list ran (`:1051` moves it back before `:1067`). The version it prints is the one in that directory. This is what H1
  predicts; H3 and H4 are still to be separated by a list taken while the source stands at the second tag, and by the
  `--json` form.
- A measurement outside the test (no probe in the tree) takes those observations on two client builds, 2.1.296 and
  2.1.290, stage by stage.

### The measurement (step 4) — the walk's commands by hand, on two client builds

No instrumentation went into the tree (step 2 did not run): the separating observations are the client's own answers
and its files on disk, read by a measurement agent (Opus 5.5, `medium`) in a scratch directory outside every checkout,
deleted afterwards. A stub-runtime, Claude-only fixture; a fresh scratch configuration directory per build; only
`claude plugin …` subcommands, no prompt and no login. Builds: `2.1.296` and `2.1.290`. Every command exited 0. The two
builds gave the same answers at every stage:

| Stage | text list `Version:` | `list --json` `version` / `folderVersion` | installed record | source folder |
|---|---|---|---|---|
| S1 install at the first tag | first | first / first | first | first |
| S2 update, source unmoved | first | first / first | first | first |
| S3 source at the second tag, `marketplace update`, `update` | second | second / second | second | second |
| S3 again after 10 s | second | second / second | — | second |
| S4 source moved back, no client command but the list | **first** | **second / first** | **second** | first |
| S5 `marketplace add`, then `install` (where `:1067` reads) | **first** | **second / first** | **second** | first |
| S6 the qualified `update` | first | first / first | first | first |

The record is `<config>/plugins/installed_plugins.json`; the marketplace is recorded with `"source": "directory"` and an
install location equal to the source itself; `list --json` names the folder as `readFromFolder`. At S5 the install
answered "already installed … it loads in place from <the source> … `claude plugin update stamity@stamity --scope
project` re-records its version, 1.9.0-fixture.2 to 1.9.0-fixture.1", with `installedVersion` the second and
`availableVersion` the first.

Verdicts:
- **H1 holds.** The deciding observation is S4: the source moved back with no client write, and the text `Version:`
  went from the second version to the first on the very next call, while the record and `list --json`'s `version` still
  named the second. The text equals the source folder's own version at all six stages.
- **H2 is killed:** after S3 the record holds the second version, its install path and the second tag's commit.
- **H3 is killed:** the list is right at once at S3 and unchanged ten seconds later; at S4 it changes immediately.
- **H4 is a description, not a cause:** the recorded version is in `--json` and absent from the text at S4 and S5, but
  the text's layout is the same on both builds.
- Points that stayed silent, and why: `update PASS` and `status-updated PASS` in the walk (they read the cache tree and
  the update's own JSON, both right), and the re-install's JSON at `:1059-1064` (it reads the record, which is right).

Not observed: the build where the text began to follow the folder. The walk passed on 2.1.278 (2026-09-22, the header's
prose); 2.1.290 already behaves as 2.1.296 does, so "red since 2.1.291" is not a boundary this machine shows — the
change sits at or before 2.1.290. The pinned eval client was not used for a third point (it is another run's input).
Whether an account-delivered flag changes the list for a signed-in configuration was not observable.

### Root cause (step 5) — gate `root-cause-before-fix`: passed

The walk is wrong; the client's update is not.

1. `test/ci/pluginLifecycle.test.ts:1051` moves the directory marketplace's source back to the first tag.
2. `:1052-1064` run the first two published rollback commands. They leave the installed record at the second version,
   as the page says and as the re-install's JSON shows (`:1061-1062`).
3. `:1067` then reads the TEXT of `claude plugin list` and expects the second version in it. On a directory
   marketplace the client reads the plugin in place, and the text's `Version:` line is the version of the folder it
   reads (`Read from:`; `folderVersion` in `--json`), which has been the first since step 1. The recorded version is
   the `version` field of `list --json` and of the record file.
4. So the assertion fails although the fact it exists to assert — the first two commands do not re-record the version
   — holds on the same run.

Confidence: high. It explains the failing line, both identical reproductions, every row that passed before it, and the
measurement at all six stages on two builds. What would have to be true for the chain to be wrong: the text line would
have to come from something other than the source folder that happens to move with it (the catalog entry, say); the
fixture cannot tell those apart, and the fix does not depend on it, since either way the text is not the record.

The published route (`docs/plugins.md:420-442`) stays true as written: three commands, the third re-records. One fact
the page does not say and a reader meets: after the source moves, the text list already shows the previous version
while the record does not.

### The failing test, as a specification

The tree already carries it: the armed walk fails at `:1067` for the cause above (seen red twice on `751aaa5e`). After
the fix the same step asserts, from `claude plugin list --json`, that the `stamity@stamity` entry's `version` is the
second fixture version and its `folderVersion` the first before the third command, and that `version` is the first
after it.

### Fix approach and its risk

Read the record where the walk means the record: replace the text substring check with the two exact fields of
`list --json`, with an inline `TEST CHANGE, justified` reason (the old assertion encoded what the text printed on
2.1.278), and say in the header prose what the text shows on a directory marketplace. Risk: the field names are the
client's; a rename turns the walk red again, which is what the walk is for. No budget, step order or other client's
walk moves. Rows 110 and 111 of the inbox, filed under "the Claude walk", describe the Cursor walk's second discovery
(`:1596-1603`) and its budget, and are not part of this cause.

### Cleanup (step 8) and regression clauses (step 9)

- Nothing to strip: no probe was written. Marker check at the close: the same two quoted scenario lines; hits carrying
  this run's id: 0.
- The Claude walk shall continue to assert that the first two published rollback commands leave the recorded version
  where it was — held by the walk at `:1067` once the fix lands.
- The Claude walk shall continue to assert that the third command re-records the version downwards — held today at
  `:1069-1072`.

Fixes attempted in this session on this defect: 0.

Next step: the release run `2026-10-11_release-1-14-0` builds the fix as its unit `w1` and runs the armed walk alone
once its eval run has ended.

