# Inbox retirements — the inbox pass (2026-10-08)

Every row the pass removed from `.stamity/inbox.md`, with the one line that retired it. Row is the bullet's line
number at `077e8a78` (the inbox state the decisions file indexes); Ref is the ledger row id for a ledger-ref row, or the
plan or record the bullet cited, or `—` for none. A ledger-ref row carries the same line in its `retired` field, with
the date the CLI wrote before it; a plan, record or no-ref row carries it only here. Exits: **fixed** — settled on
`main` before the pass; **fix-in-session** — settled by a commit of this session's branch `lean-flows-01` (or merged
to `main` the same day); **cut** — no work is owed, and the reason says why; **scheduled** — a live unit already names
it; **scheduled-fold** — the pass folded it into the named unit or place (`357c5cb3`, `2dbd7e19`). Row 389's line is
last: it names the learning commit this pass made.

Rows: 416 decided · removed here: 396 · staying: 15 (named with their places in `record.md`) · waiting on part 2: 5
(rows 519, 560, 585, 586, 588) · re-filed remainders: 1 (row 524's, as `2026-10-08_inbox-pass/pass/1`).

| Row | Ref | Exit | Reason |
|---|---|---|---|
| 16 | `docs/plans/008-plugin-lifecycle-03.md` | scheduled | scheduled to b3-start-routes (docs/plans/017-docs-overhaul-02.md); inbox pass 2026-10-08 |
| 17 | `docs/plans/008-plugin-lifecycle-01.md` | scheduled | scheduled to u2-apm-placeholders (docs/plans/016-fork-distribution-02.md); inbox pass 2026-10-08 |
| 19 | `docs/plans/008-plugin-lifecycle-01.md` | cut | cut: a trigger-only option no live unit names; plan 016 moves the catalogs off npm sources (u2-main-catalogs), and nothing fails until a consuming organization asks; inbox pass 2026-10-08 |
| 21 | `.stamity/runs/2026-09-17_codex-astra-audit/findings.md` | cut | cut: an umbrella of about forty Minors (wording, literals, checker messages); its signing items ride row 32, its hardcoded remedy calls are gone from src, its private-layer items are not this tree's; inbox pass 2026-10-08 |
| 22 | `docs/plans/008-plugin-lifecycle-02.md` | cut | cut: trigger-only (a public CLI user asks to move) and no live unit names it; the documented route clean -y then plugin setup works today; inbox pass 2026-10-08 |
| 31 | `2026-09-17_plugin-lifecycle/build/1` | fix-in-session | fixed in a58f4d98 (the pack signing rehearsal re-runs when either signing script changes); inbox pass 2026-10-08 |
| 32 | `2026-09-17_plugin-lifecycle/build/2` | cut | cut: still present but author-run only: a raw ENOENT, a race the atomic writer re-checks, and a wrong identity refused after verify and before any bundle is written; inbox pass 2026-10-08 |
| 33 | `2026-09-17_plugin-lifecycle/build/4` | fixed | fixed in abbcd907 (failureIds reads both the string ids and the driver's object shape before the repeat comparison); inbox pass 2026-10-08 |
| 34 | `2026-09-17_plugin-lifecycle/build/5` | cut | cut: a cap working as designed: the next writer meets the 130-line pin and trims; the file is 129 lines and nothing wrong ships; inbox pass 2026-10-08 |
| 35 | `2026-09-17_plugin-lifecycle/build/12` | cut | cut: emitted runner size with no declared budget and no documented client limit; nothing observable fails; inbox pass 2026-10-08 |
| 36 | `2026-09-17_plugin-lifecycle/build/13` | cut | cut: a dead path beside a working fallback in a private-layer script; nothing in this tree changes and the step still runs; inbox pass 2026-10-08 |
| 37 | `2026-09-17_plugin-lifecycle/build/15` | scheduled | scheduled to u2-apm-floor-current (docs/plans/016-fork-distribution-02.md); inbox pass 2026-10-08 |
| 38 | `2026-09-17_plugin-lifecycle/build/17` | cut | cut: the operator skill and the README already mark the file historical; a missing banner misleads no run; inbox pass 2026-10-08 |
| 39 | `2026-09-17_plugin-lifecycle/build/19` | cut | cut: true but vacuous on a fork only; the rehearsal is canonical-only by its job guard, so no wrong result follows; inbox pass 2026-10-08 |
| 40 | `2026-09-17_plugin-lifecycle/build/22` | cut | cut: a load-only local flake, green on every CI leg; the recorded lane learning (build first) and no site build beside a gate keep it away; inbox pass 2026-10-08 |
| 41 | `2026-09-17_plugin-lifecycle/prove/5` | cut | cut: accepted residual: the nested runner and hooks file sit in the agent-writable workspace, as the real runner does, so a party able to plant them can already edit the trusted one; inbox pass 2026-10-08 |
| 42 | `2026-09-17_plugin-lifecycle/prove/7` | fixed | fixed in abbcd907 (sameConfiguration returns false when a summary records none of the comparator fields); inbox pass 2026-10-08 |
| 43 | `2026-09-17_plugin-lifecycle/prove/14` | fixed | fixed in 3ca736d5 (one default-branch read before the loop; the note says when the upstream could not be read); the compare-only rate-limit note cut below the floor (the check fails closed either way); inbox pass 2026-10-08 |
| 45 | `2026-09-17_plugin-lifecycle/prove/20` | cut | cut: leniency in the safe direction, documented at the reader: a string private flag only silences the update notice; inbox pass 2026-10-08 |
| 46 | `2026-09-17_plugin-lifecycle/prove/27` | scheduled | scheduled to u1-fork-release-hardening (docs/plans/016-fork-distribution-01.md); inbox pass 2026-10-08 |
| 47 | `2026-09-17_plugin-lifecycle/prove/28` | fixed | fixed in 60f13d65 (the comment was rewritten; the over-fifteen count is gone); inbox pass 2026-10-08 |
| 48 | `2026-09-17_plugin-lifecycle/prove/29` | cut | cut: one word of spec prose over a skip whose reason sits in comments; no gate or reader acts on it; inbox pass 2026-10-08 |
| 49 | `2026-09-17_plugin-lifecycle/prove/1` | cut | cut: unmeasured comment bytes in the emitted runner, with no budget and no observed slowdown; the same disposition as line 35; inbox pass 2026-10-08 |
| 55 | `2026-09-17_plugin-lifecycle/build/24` | cut | cut: a stale usage comment: tarball-smoke copies the gate in and never passes --root; the flag itself works; inbox pass 2026-10-08 |
| 56 | `2026-09-17_plugin-lifecycle/build/28` | scheduled-fold | scheduled to u2-plugin-overrides (docs/plans/016-fork-distribution-02.md); inbox pass 2026-10-08 |
| 57 | `2026-09-17_plugin-lifecycle/prove/40` | cut | cut: plan-conformant first-package.json rule; a hoisted workspace companion is a refinement no consumer has hit; inbox pass 2026-10-08 |
| 58 | `2026-09-17_plugin-lifecycle/prove/45` | cut | cut: npm ci is bounded by the job timeout and the test's spawn timeout; a hung install fails the run either way; inbox pass 2026-10-08 |
| 59 | `2026-09-17_plugin-lifecycle/prove/47` | cut | cut: the two branches agree on every emitted row under the flat hooks/ layout; no row reaches the difference; inbox pass 2026-10-08 |
| 60 | `2026-09-17_plugin-lifecycle/prove/48` | cut | cut: a refusal names the entry and the rerun refuses the non-empty --out; the operator removes it, and no data is lost; inbox pass 2026-10-08 |
| 61 | `2026-09-17_plugin-lifecycle/prove/49` | scheduled-fold | scheduled to u2-review-gate-all (docs/plans/016-fork-distribution-02.md); inbox pass 2026-10-08 |
| 62 | `2026-09-17_plugin-lifecycle/build/33` | cut | cut: two spellings of one two-call resolver, byte-equivalent; nothing diverges until one is edited, and the Warning overstated a duplication the wave map explains; inbox pass 2026-10-08 |
| 63 | `2026-09-17_plugin-lifecycle/build/37` | cut | cut: deliberate duplication across two runtimes, bound by a round-trip test; no third consumer exists; inbox pass 2026-10-08 |
| 64 | `2026-09-17_plugin-lifecycle/build/42` | scheduled | scheduled to u3-rollout-guides (docs/plans/016-fork-distribution-03.md); inbox pass 2026-10-08 |
| 66 | `2026-09-17_plugin-lifecycle/build/46` | cut | cut: the literal path is correct in both modes (the emitter relocates the file); a consolidation with no wrong result; inbox pass 2026-10-08 |
| 67 | `2026-09-17_plugin-lifecycle/build/51` | scheduled | scheduled to u2-apm-backed-mode (docs/plans/016-fork-distribution-02.md); inbox pass 2026-10-08 |
| 68 | `2026-09-17_plugin-lifecycle/build/52` | scheduled | scheduled to u2-apm-backed-mode (docs/plans/016-fork-distribution-02.md); inbox pass 2026-10-08 |
| 69 | `2026-09-17_plugin-lifecycle/build/53` | cut | cut: no consumer path reaches it: a plugin-backed Codex client gets no project hooks file, and Codex turns hooks on by default anyway; inbox pass 2026-10-08 |
| 70 | `2026-09-17_plugin-lifecycle/build/54` | cut | cut: correct per client and only noisy per directory; a reader gets three true lines for one stale skill; inbox pass 2026-10-08 |
| 71 | `2026-09-17_plugin-lifecycle/prove/60` | cut | cut: a watch item: the declared floor is met and the gate itself fails the unit that drops below it; inbox pass 2026-10-08 |
| 72 | `2026-09-17_plugin-lifecycle/build/59` | cut | cut: no floor binds src/cli and the arms run through check's suite; u2-apm-backed-mode rewrites these arms with its own cases; inbox pass 2026-10-08 |
| 74 | `2026-09-17_plugin-lifecycle/prove/75` | cut | cut: its trigger fired: the publish job has since run inside its ceiling at every release from 1.9.0 to 1.12.0; inbox pass 2026-10-08 |
| 75 | `2026-09-17_plugin-lifecycle/build/62` | scheduled | scheduled to b3-start-routes (docs/plans/017-docs-overhaul-02.md); inbox pass 2026-10-08 |
| 76 | `2026-09-17_plugin-lifecycle/build/63` | fixed | fixed in 621fea4 (the README's Codex --ref form pinned to the spelling codex plugin marketplace add --help lists on 0.154.0); the remote --ref route executed since (docs/plugins.md:267-278, the 2026-09-24 walk on codex-cli 0.155.1); inbox pass 2026-10-08 |
| 78 | `2026-09-17_plugin-lifecycle/prove/98` | cut | cut: byte-identical helpers repeated across four container modules; nothing diverges today; inbox pass 2026-10-08 |
| 80 | `2026-09-17_plugin-lifecycle/prove/104` | cut | cut: a load-only local flake, green alone and on every CI leg; the same disposition as line 40; inbox pass 2026-10-08 |
| 82 | `2026-09-17_plugin-lifecycle/prove/106` | scheduled | scheduled to u2-apm-backed-mode (docs/plans/016-fork-distribution-02.md); inbox pass 2026-10-08 |
| 83 | `2026-09-17_plugin-lifecycle/prove/107` | scheduled-fold | scheduled to u1-fork-release-hardening (docs/plans/016-fork-distribution-01.md); inbox pass 2026-10-08 |
| 94 | `2026-09-17_plugin-lifecycle/build/64` | cut | cut: the three spellings still exist, but nightly is disabled and release.yml build lines are cross-checked by test; a drift fails a test rather than shipping; inbox pass 2026-10-08 |
| 95 | `2026-09-17_plugin-lifecycle/build/65` | cut | cut: the unpinned vendor installer runs in a contents:read job with no secret; the vendor publishes no digest, and the release workflows read no Actions cache, so no pin exists to adopt; inbox pass 2026-10-08 |
| 96 | `2026-09-17_plugin-lifecycle/build/67` | cut | cut: a 15-minute ceiling on a job measured at ~49 s only bounds a hang; nothing goes wrong if it is never re-derived; inbox pass 2026-10-08 |
| 97 | `2026-09-17_plugin-lifecycle/build/69` | cut | cut: the --client help omits that status narrows only the clients rows; the type docblock states it; no wrong result, only a help sentence a --json reader may miss; inbox pass 2026-10-08 |
| 98 | `2026-09-17_plugin-lifecycle/build/70` | fixed | fixed in 60f13d65 (the distribution suite derives SLUG from test/support/identity.ts; the Codex pins use it); inbox pass 2026-10-08 |
| 99 | `2026-09-17_plugin-lifecycle/prove/109` | cut | cut: latest vendor CLIs in a job with contents:read, no secret, no id-token and persist-credentials false; the reachable consequence is a gate verdict, recorded as a decision; inbox pass 2026-10-08 |
| 100 | `2026-09-17_plugin-lifecycle/prove/112` | cut | cut: the detail line is still composed twice from one helper plus remedy; both spellings are identical today, a hoist only; inbox pass 2026-10-08 |
| 101 | `2026-09-17_plugin-lifecycle/prove/115` | cut | cut: same help-text gap as build/69: --client narrows clients rows only, documented in the type; no wrong result; inbox pass 2026-10-08 |
| 102 | `2026-09-17_plugin-lifecycle/prove/116` | cut | cut: a literal-vs-literal pin that guards a README rewrite as intended; the missing sha-256 in the comment changes no verdict; inbox pass 2026-10-08 |
| 103 | `2026-09-17_plugin-lifecycle/build/73` | cut | cut: a header comment still names the retired code 64; errors.ts records the retirement and the runtime exit is 1; a stale comment only; inbox pass 2026-10-08 |
| 104 | `2026-09-17_plugin-lifecycle/prove/120` | fixed | fixed in .github/workflows/ci.yml:575,586,596 (each global install passes --ignore-scripts explicitly; the install legs measured green in CI run 35704788217); inbox pass 2026-10-08 |
| 105 | `2026-09-17_plugin-lifecycle/prove/123` | cut | cut: nightly is disabled manually, so its copy of the build block runs nowhere; the hoist is build/64 and changes no result; inbox pass 2026-10-08 |
| 106 | `2026-09-17_plugin-lifecycle/prove/127` | cut | cut: the regex is spelled twice and identical today; the two runtimes cannot share one import; a drift would fail an eval case, not ship; inbox pass 2026-10-08 |
| 107 | `2026-09-17_plugin-lifecycle/prove/130` | cut | cut: a test comment narrating one run's counts; true of that run, it moves no assertion; inbox pass 2026-10-08 |
| 108 | `2026-09-17_plugin-lifecycle/prove/131` | fixed | fixed in 9d4a1946 (the Windows-stat evidence-archive case carries an explicit 60 s timeout); inbox pass 2026-10-08 |
| 109 | `2026-09-17_plugin-lifecycle/prove/132` | cut | cut: the spawn-free pin is a denylist guarding future edits of a builtins-only credential step in the disabled nightly; nothing spawns there today; inbox pass 2026-10-08 |
| 110 | `2026-09-17_plugin-lifecycle/prove/133` | cut | cut: same class as line 109: a path-invoked binary would slip the lookbehind, but no such line exists and the nightly is disabled; inbox pass 2026-10-08 |
| 111 | `2026-09-17_plugin-lifecycle/build/76` | scheduled-fold | scheduled to u2-plugin-overrides (docs/plans/016-fork-distribution-02.md); inbox pass 2026-10-08 |
| 112 | `2026-09-17_plugin-lifecycle/build/77` | cut | cut: a unit-size note on a landed unit; bookkeeping; inbox pass 2026-10-08 |
| 113 | `2026-09-17_plugin-lifecycle/build/79` | cut | cut: three suites seed their own corpus; duplicated fixture knowledge, no wrong result; inbox pass 2026-10-08 |
| 114 | `2026-09-17_plugin-lifecycle/build/80` | cut | cut: the --push path is a maintainer-only release fixture step walked by hand in V4; an untested branch with no user reach; inbox pass 2026-10-08 |
| 115 | `2026-09-17_plugin-lifecycle/build/81` | cut | cut: no emitted or accepted row has a path with a space, quote or backslash, so the fallback arm is unreachable today; inbox pass 2026-10-08 |
| 116 | `2026-09-17_plugin-lifecycle/build/82` | cut | cut: Codex loads the project hooks file from the session's project, so a cwd outside that ancestry means the project hooks were not loaded anyway; the starter's exit 1 adds no gap; inbox pass 2026-10-08 |
| 117 | `2026-09-17_plugin-lifecycle/build/83` | cut | cut: measured safe on all three clients; the row records no defect, only a design note; inbox pass 2026-10-08 |
| 118 | `2026-09-17_plugin-lifecycle/build/84` | cut | cut: the layout is derived from the policy path, exact for both production call shapes; a refactor only; inbox pass 2026-10-08 |
| 119 | `2026-09-17_plugin-lifecycle/build/85` | cut | cut: a unit-size note on a landed unit; bookkeeping; inbox pass 2026-10-08 |
| 120 | `2026-09-17_plugin-lifecycle/prove/155` | fixed | fixed in 748d6426 (the staging-tree count runs in a private temp root of its own); inbox pass 2026-10-08 |
| 121 | `2026-09-17_plugin-lifecycle/prove/156` | cut | cut: two schema readers exist; the test reader reports any keyword it cannot apply as a defect, so a divergence fails loud; inbox pass 2026-10-08 |
| 122 | `2026-09-17_plugin-lifecycle/prove/157` | cut | cut: a unit-size note on a landed unit; bookkeeping; inbox pass 2026-10-08 |
| 123 | `2026-09-17_plugin-lifecycle/prove/159` | cut | cut: an empty client-owned directory per armed maintainer run; no user reach, no wrong result; inbox pass 2026-10-08 |
| 124 | `2026-09-17_plugin-lifecycle/prove/173` | cut | cut: trailing blank lines carry no fixture text and the pin was red-checked on a one-character change; inbox pass 2026-10-08 |
| 125 | `2026-09-17_plugin-lifecycle/prove/189` | fixed | fixed in 6f04a35c and 3760163f (the SECURITY.md paragraph left, the troubleshooting sample retaken, the plugins.md count gone); the 1.8.0 test stubs and the unnamed config set gates.* cut below the floor; inbox pass 2026-10-08 |
| 126 | `2026-09-17_plugin-lifecycle/prove/190` | fixed | fixed in 495dc7e4 (the claude-hook-shell check row fails on a Windows host with no Git Bash and names the remedy; troubleshooting documents it); the PowerShell-fallback launch itself cut below the floor (declared, check-detected); inbox pass 2026-10-08 |
| 127 | `2026-09-17_plugin-lifecycle/prove/191` | cut | cut: a test refinement; the two bodies differ by design and no divergence is known; inbox pass 2026-10-08 |
| 128 | `2026-09-17_plugin-lifecycle/prove/192` | cut | cut: the layout decision is encoded twice from one input and agrees for every emitted shape; a refactor only; inbox pass 2026-10-08 |
| 129 | `2026-09-17_plugin-lifecycle/prove/193` | cut | cut: a stale docblock about script root precedence; no behaviour reads it; inbox pass 2026-10-08 |
| 130 | `2026-09-17_plugin-lifecycle/prove/194` | cut | cut: fail-closed either way: a signal-killed guard still blocks; only the diagnosis text is generic; inbox pass 2026-10-08 |
| 131 | `2026-09-17_plugin-lifecycle/prove/195` | cut | cut: same reading as prove/115: whole-surface fields under --client are documented in the docblock; no wrong result; inbox pass 2026-10-08 |
| 132 | `2026-09-17_plugin-lifecycle/prove/196` | cut | cut: the rank is documented and a symlinked generated tree is not a layout the engine emits; inbox pass 2026-10-08 |
| 133 | `2026-09-17_plugin-lifecycle/prove/204` | fixed | fixed in 1c759af5 (every redaction directory is listed under both its spellings, the realpath form included); inbox pass 2026-10-08 |
| 134 | `2026-09-17_plugin-lifecycle/prove/205` | cut | cut: a QA-harness convenience: a --clients subset still walks every client; extra time, no wrong verdict; inbox pass 2026-10-08 |
| 135 | `2026-09-17_plugin-lifecycle/prove/206` | cut | cut: a killed suite reads failed with the exit in its reason; the operator sees the stop and reruns; no false pass; inbox pass 2026-10-08 |
| 136 | `2026-09-17_plugin-lifecycle/prove/208` | fixed | fixed in 1c759af5 (the stale "same nine entries" text is gone from the QA form); inbox pass 2026-10-08 |
| 137 | `2026-09-17_plugin-lifecycle/prove/215` | cut | cut: the test reader reports maxLength as an unappliable keyword, so the twins cannot silently disagree; same hoist as prove/156; inbox pass 2026-10-08 |
| 138 | `2026-09-17_plugin-lifecycle/prove/216` | cut | cut: duplicate of prove/127: the regex is spelled twice and identical; no wrong result; inbox pass 2026-10-08 |
| 139 | `2026-09-17_plugin-lifecycle/prove/217` | cut | cut: both generators refuse before any write; the APM message names one path instead of two; wording only; inbox pass 2026-10-08 |
| 140 | `2026-09-17_plugin-lifecycle/prove/219` | cut | cut: duplicated test helpers; no wrong result; inbox pass 2026-10-08 |
| 141 | `2026-09-17_plugin-lifecycle/prove/222` | cut | cut: parseArguments refuses a non-empty --out, so the removal on throw deletes only an empty directory the operator named for this build; inbox pass 2026-10-08 |
| 142 | `2026-09-17_plugin-lifecycle/prove/230` | cut | cut: the installed=true outputs are read by nothing; dead output lines, harmless; inbox pass 2026-10-08 |
| 143 | `2026-09-17_plugin-lifecycle/prove/231` | cut | cut: duplicate of build/67: a generous ceiling only bounds a hang; inbox pass 2026-10-08 |
| 144 | `2026-09-17_plugin-lifecycle/prove/232` | cut | cut: the nightly workflow is disabled manually, so the armed codex leg never runs; a red leg would be visible when re-armed; inbox pass 2026-10-08 |
| 145 | `2026-09-17_plugin-lifecycle/prove/234` | cut | cut: duplicate class of line 95: the vendor offers no checksum and the install runs only in secret-free steps (the nightly copy is disabled); inbox pass 2026-10-08 |
| 146 | `2026-09-17_plugin-lifecycle/prove/243` | cut | cut: a client-owned chat record per armed maintainer run, same class as prove/159; no user reach; inbox pass 2026-10-08 |
| 148 | `2026-09-17_plugin-lifecycle/prove/253` | cut | cut: the exit contract measures the route; a cleanup failure is reported in the reason, stderr and JSON; inbox pass 2026-10-08 |
| 149 | `2026-09-17_plugin-lifecycle/prove/255` | cut | cut: the claude-hook-shell row no longer compares PATH entries against System32; it reads Git Bash places only, so the junction premise is gone; inbox pass 2026-10-08 |
| 150 | `2026-09-17_plugin-lifecycle/prove/267` | cut | cut: cost only: a second model call on an already-limited account; the leg reads SKIPPED, evidence unaffected; inbox pass 2026-10-08 |
| 151 | `2026-09-17_plugin-lifecycle/prove/268` | cut | cut: the Copilot discovery-first body is measured end to end by the route proof's invocation leg; a rubric case adds little; inbox pass 2026-10-08 |
| 152 | `2026-09-17_plugin-lifecycle/prove/271` | scheduled-fold | scheduled to u2-shrinkwrap (docs/plans/016-fork-distribution-02.md); inbox pass 2026-10-08 |
| 153 | `2026-09-17_plugin-lifecycle/prove/275` | cut | cut: every measured client reads the two files separately; the combined-read shape is not observed; inbox pass 2026-10-08 |
| 154 | `2026-09-17_plugin-lifecycle/prove/276` | cut | cut: a rename empties the slice and the toContain fails, so the pin cannot go green wrongly; inbox pass 2026-10-08 |
| 160 | `2026-09-17_plugin-lifecycle/prove/282` | cut | cut: comment-only: the describe header (test/cli/commands/check.test.ts:1720-1721) lacks the "bare" qualifier the case title at :1818 carries; no test outcome changes; inbox pass 2026-10-08 |
| 161 | `2026-09-17_plugin-lifecycle/prove/283` | cut | cut: an uncited libuv claim in two code comments (src/cli/commands/check.ts:598,1762); the behaviour is tested and nothing reads the comment; inbox pass 2026-10-08 |
| 162 | `2026-09-17_plugin-lifecycle/prove/295` | cut | cut: the run 32 erratum landed (RESULTS.md:328) and every later run is measured on cases-v6, so a comparison over cases-v5 ids cannot recur; the run's substance was unaffected; inbox pass 2026-10-08 |
| 164 | `2026-09-17_plugin-lifecycle/prove/297` | cut | cut: the disclosed fail-open on an unparseable payload stays (guard :310-327); the payload is serialized by the client itself, so no party can plant a malformed one; inbox pass 2026-10-08 |
| 165 | `2026-09-17_plugin-lifecycle/prove/298` | cut | cut: the afterAll sweep deletes only chat records whose own recorded cwd starts with this walk's mkdtemp base; a dry-run listing adds no protection; inbox pass 2026-10-08 |
| 166 | `2026-09-17_plugin-lifecycle/prove/299` | cut | cut: leftover scratch session transcripts under the client config dir are disk clutter on the maintainer machine; nothing reads or ships them; inbox pass 2026-10-08 |
| 169 | `2026-09-17_plugin-lifecycle/prove/324` | fixed | fixed in 239eb3a9 (.claude/settings.json owned per entry on a shared co-owned core, not per top-level key); the vanished-file label cut below the floor (label only, disk state right); inbox pass 2026-10-08 |
| 170 | `2026-09-17_plugin-lifecycle/prove/326` | cut | cut: QA-harness refinements: a not-run reading on an unmeasured Cursor render, a missing word, and a short password that over-redacts log text (never under-redacts); nothing shipped changes; inbox pass 2026-10-08 |
| 175 | `2026-09-17_plugin-lifecycle/prove/330` | scheduled | scheduled to u1-fork-neutral-tests (docs/plans/016-fork-distribution-01.md), with u1-fork-ci-job running the suite as a renamed fork; inbox pass 2026-10-08 |
| 176 | `2026-09-17_plugin-lifecycle/prove/331` | cut | cut: no string in the walked suites trips the // stripper today, and u1-fork-ci-job (016-01:1804) will run the whole suite renamed, catching any literal a count misses; inbox pass 2026-10-08 |
| 181 | `2026-09-17_plugin-lifecycle/prove/334` | fixed | fixed in 2701139a (RUN_OF_RECORD_CANDIDATE removed; the run of record moved to runs 34 and 35); the case-input check, the generatedPaths example and the 1.9.1 line cut below the floor; inbox pass 2026-10-08 |
| 186 | `2026-09-17_plugin-lifecycle/prove/337` | fixed | fixed in cb4fdb1f (the locator hands check its root as PLUGIN_ROOT; the remedy names the locator, not st-setup); inbox pass 2026-10-08 |
| 187 | `2026-09-17_plugin-lifecycle/prove/338` | fixed | fixed in 871ee7bd (DISTRIBUTION.note says plugin install writes enabledPlugins alone); inbox pass 2026-10-08 |
| 188 | `2026-09-17_plugin-lifecycle/prove/339` | cut | cut: test-depth notes: the run-of-record check reads only the first claim per page (test/docsPages.test.ts:1319), a stated independence assumption, a stale spec cite; no wrong result follows; inbox pass 2026-10-08 |
| 194 | `docs/plans/009-orchestrator-context-economy-01.md` | cut | cut: a declined optimization (the per-pass loop); the replay is retired and the Package 17 sweep closed without it; nothing fails while it stays declined; inbox pass 2026-10-08 |
| 195 | `docs/plans/009-orchestrator-context-economy-01.md` | cut | cut: a list of unaddressed context levers from plan 009 research, ideas without a failure path; plan 019 file 3 q5-usage-lines will measure cost per phase; inbox pass 2026-10-08 |
| 196 | `docs/plans/009-orchestrator-context-economy-01.md` | cut | cut: measurements count a run in progress on a Status line anywhere (src/cli/docs/measurements.ts:627) while the card reads 15 lines; differs only for a closed record quoting an in-progress status; inbox pass 2026-10-08 |
| 197 | `docs/plans/009-orchestrator-context-economy-01.md` | cut | cut: an unmeasured Copilot hook idea for shrinking verdict returns; speculative, no failure path; inbox pass 2026-10-08 |
| 198 | `docs/plans/009-orchestrator-context-economy-01.md` | cut | cut: an unmeasured idea (two-tier researcher returns); the planner reads returns whole by design; inbox pass 2026-10-08 |
| 199 | `docs/plans/009-orchestrator-context-economy-02.md` | scheduled-fold | scheduled to p6-eval-cases-core (docs/plans/019-lean-flows-02.md); inbox pass 2026-10-08 |
| 200 | `docs/plans/009-orchestrator-context-economy-02.md` | scheduled-fold | scheduled to p6-eval-cases-core (docs/plans/019-lean-flows-02.md); inbox pass 2026-10-08 |
| 201 | `docs/plans/009-orchestrator-context-economy-02.md` | scheduled-fold | scheduled to p6-eval-cases-core (docs/plans/019-lean-flows-02.md); inbox pass 2026-10-08 |
| 202 | `docs/plans/009-orchestrator-context-economy-01.md` | cut | cut: historical accuracy of a closed run record (outage time, unrecorded stalls); no gate or reader acts on those lines; inbox pass 2026-10-08 |
| 211 | `2026-09-23_orchestrator-context/build/116` | cut | cut: one darwin full-suite failure on 2026-09-23 that is a loud, retryable refusal; it passed alone and on rerun and no later run records it, so the Warning overstated it; inbox pass 2026-10-08 |
| 212 | `2026-09-23_orchestrator-context/build/134` | fix-in-session | fixed in c021bb4c and 14ee4fe6 (the win32 stub-build budget raised, the serial Windows files split across both shards by total shard time); inbox pass 2026-10-08 |
| 213 | `2026-09-23_orchestrator-context/build/368` | scheduled-fold | scheduled to f2-lane-release-tags-only (docs/plans/014-lean-repository-01.md); inbox pass 2026-10-08 |
| 214 | `2026-09-23_orchestrator-context/build/7` | cut | cut: wording: the inline-return fallback reaches the no-grant-with-path case by elimination; roles behave the same; inbox pass 2026-10-08 |
| 215 | `2026-09-23_orchestrator-context/build/8` | cut | cut: a role may echo the absolute report path on its digest line; ledger append tolerates it, so nothing breaks; inbox pass 2026-10-08 |
| 216 | `2026-09-23_orchestrator-context/build/11` | cut | cut: duplicated section() helpers across corpus test suites (four copies plus two sectionOf); test hygiene, no wrong result; inbox pass 2026-10-08 |
| 217 | `2026-09-23_orchestrator-context/build/21` | cut | cut: an untestable stdin-is-a-TTY branch (spawnSync cannot give a TTY); no failure path shown; inbox pass 2026-10-08 |
| 218 | `2026-09-23_orchestrator-context/build/29` | cut | cut: the fixer findings line carries no Minor count; the body matches the plan text and the reviewer ledgers Minors; inbox pass 2026-10-08 |
| 219 | `2026-09-23_orchestrator-context/build/30` | cut | cut: the eval case B4 criterion stays unambiguous because the scenario names no report path; no grading error occurs; inbox pass 2026-10-08 |
| 220 | `2026-09-23_orchestrator-context/build/32` | fixed | fixed in ae577abd (a ledger over 4 MiB by lstat is not read; report reads bounded by count); inbox pass 2026-10-08 |
| 221 | `2026-09-23_orchestrator-context/build/40` | fixed | fixed in ae577abd (ledger read capped at 4 MiB, at most 256 report reads, git metadata at 4 KiB); inbox pass 2026-10-08 |
| 222 | `2026-09-23_orchestrator-context/build/49` | scheduled-fold | scheduled to p6-eval-cases-core (docs/plans/019-lean-flows-02.md); inbox pass 2026-10-08 |
| 223 | `2026-09-23_orchestrator-context/build/55` | cut | cut: st-work.md omits two digest clauses the agent definitions carry, so no runtime loss; inbox pass 2026-10-08 |
| 224 | `2026-09-23_orchestrator-context/build/56` | cut | cut: a prose count of unrecorded placements off by one; wording only; inbox pass 2026-10-08 |
| 225 | `2026-09-23_orchestrator-context/build/83` | fixed | fixed in c419eab1 (a report-less --stdin append matches existing rows by phase, source and evidence and prints already-filed); inbox pass 2026-10-08 |
| 226 | `2026-09-23_orchestrator-context/build/86` | cut | cut: three private readAll copies (learn.ts:210, ledger.ts:179, handoff.ts:176) with the same signature; duplication, no wrong result; inbox pass 2026-10-08 |
| 227 | `2026-09-23_orchestrator-context/build/104` | cut | cut: an uncapped id list in a refusal message, bounded by the success path own output; no failure path; inbox pass 2026-10-08 |
| 228 | `2026-09-23_orchestrator-context/build/142` | cut | cut: by the row own text bounded to --ids and never a wrong state; a note-shaped rationale gives a visible refusal; inbox pass 2026-10-08 |
| 229 | `2026-09-23_orchestrator-context/build/180` | fixed | fixed in ae577abd (readLedger refuses a ledger over LEDGER_READ_MAX_BYTES; the code comment cites this row); inbox pass 2026-10-08 |
| 230 | `2026-09-23_orchestrator-context/build/262` | cut | cut: duplicated helpers (escapeRegExp at src/runs/ledgerStore.ts:312 and src/learnings/validation.ts:404, three cut helpers); no wrong result; inbox pass 2026-10-08 |
| 231 | `2026-09-23_orchestrator-context/build/284` | cut | cut: a record line holding U+2028/U+2029 prints (not recorded) on the card; the writer never puts those there and the output is visible; inbox pass 2026-10-08 |
| 232 | `2026-09-23_orchestrator-context/build/285` | fixed | fixed in c419eab1 (ledger close --id reads the short <phase>/<n> form through qualifyLedgerId); inbox pass 2026-10-08 |
| 233 | `2026-09-23_orchestrator-context/build/286` | cut | cut: an all-unprintable locator or summary lands as an empty evidence half; only a deliberately odd input reaches it; inbox pass 2026-10-08 |
| 234 | `2026-09-23_orchestrator-context/build/303` | fixed | fixed in 666dd70e (the stale about-6.0x comment left src/content/charter.ts; the ratio reads 4.85x at :277); inbox pass 2026-10-08 |
| 235 | `2026-09-23_orchestrator-context/build/306` | cut | cut: a stale doc comment (src/runs/layout.ts:149-152) on where the tag block is stripped; the code is right; inbox pass 2026-10-08 |
| 236 | `2026-09-23_orchestrator-context/build/329` | cut | cut: three spec amendments carry no acceptance criterion while agent and body text carry the clauses; spec bookkeeping; inbox pass 2026-10-08 |
| 237 | `2026-09-23_orchestrator-context/build/350` | scheduled-fold | scheduled to p6-eval-cases-core (docs/plans/019-lean-flows-02.md); inbox pass 2026-10-08 |
| 238 | `2026-09-23_orchestrator-context/build/351` | cut | cut: a stale codex version literal in a QA-harness not-run reason (scripts/qa/hook-runs.mjs:131); the skip is recorded either way; inbox pass 2026-10-08 |
| 239 | `2026-09-23_orchestrator-context/build/352` | cut | cut: a stale Claude version literal in a QA-harness skip note; the skip itself is right; inbox pass 2026-10-08 |
| 240 | `2026-09-23_orchestrator-context/build/357` | cut | cut: the learning still says vitest -u without the files-first form (line 16); the dedicated vitest learning states the right form; inbox pass 2026-10-08 |
| 242 | `2026-09-23_orchestrator-context/build/361` | cut | cut: an unpinned SECURITY.md row wording while its file::symbol pointers are checked; wording only; inbox pass 2026-10-08 |
| 243 | `2026-09-23_orchestrator-context/build/369` | fixed | fixed in 337b64f8 (CONFIDENCE refuses a version number: lookbehind/lookahead on dots at src/cli/docs/measurements.ts:584); inbox pass 2026-10-08 |
| 251 | `docs/plans/010-enterprise-release-01.md` | scheduled | scheduled to u1-fork-attestations (docs/plans/016-fork-distribution-01.md); inbox pass 2026-10-08 |
| 252 | `docs/plans/010-enterprise-release-01.md` | cut | cut: the hard-coded stamity@stamity install strings matter only with a fork-owned command name, which no live plan builds; inbox pass 2026-10-08 |
| 253 | `docs/plans/010-enterprise-release-01.md` | cut | cut: the vendor hooks page (read 2026-10-08) says hooks of plugins force-enabled in managed enabledPlugins are exempt from allowManagedHooksOnly, so the guard runs; nothing left to measure; inbox pass 2026-10-08 |
| 254 | `docs/plans/010-enterprise-release-01.md` | cut | cut: the Cursor team-marketplace walk waits for an account; the gap is documented as not walked (016-03:272), so no claim is false; inbox pass 2026-10-08 |
| 255 | `docs/plans/010-enterprise-release-02.md` | cut | cut: per-call eval token usage is not captured; costs are estimable from the price list, and nothing yields a wrong result without it; inbox pass 2026-10-08 |
| 264 | `2026-09-24_enterprise-release/build/4` | cut | cut: fork-release.yml's gates refuse the pairing before any publish and name this script as the remedy; an earlier refusal only moves the same stop sooner; inbox pass 2026-10-08 |
| 265 | `2026-09-24_enterprise-release/review/3` | cut | cut: a symlinked or directory stamity-plugin.json inside a client-installed plugin root is not a shape any client writes; the two predicates agree on every real root; inbox pass 2026-10-08 |
| 266 | `2026-09-24_enterprise-release/review/8` | scheduled | scheduled to u2-admin-templates (docs/plans/016-fork-distribution-02.md); inbox pass 2026-10-08 |
| 267 | `2026-09-24_enterprise-release/review/21` | cut | cut: same claim as build/4: fork-release.yml's gates refuse the GitHub Packages scope pairing before publish with a remedy naming the script; inbox pass 2026-10-08 |
| 268 | `2026-09-24_enterprise-release/build/16` | cut | cut: an over-cap ledger is still flagged by ledgerUnreadable and a stderr warning; the missing size and the two extra --json keys change no count a reader acts on wrongly; inbox pass 2026-10-08 |
| 269 | `2026-09-24_enterprise-release/build/19` | fixed | fixed in 079a8c8b and 075a8263 (the Codex text says the hooks feature is on by default and writes hooks = true explicitly; no defaults-off claim remains); inbox pass 2026-10-08 |
| 270 | `2026-09-24_enterprise-release/review/55` | cut | cut: each walked item is byte-capped and the counts are the repository's own runs and worktrees (dozens); no observed or plausible budget breach; inbox pass 2026-10-08 |
| 271 | `2026-09-24_enterprise-release/review/59` | cut | cut: same surface as build/16: ledgerUnreadable already separates an over-cap ledger from an empty one, and 256 unchecked reports is a ceiling no run has approached; inbox pass 2026-10-08 |
| 272 | `2026-09-24_enterprise-release/build/26` | scheduled | scheduled to u2-channels-promote (docs/plans/016-fork-distribution-02.md); inbox pass 2026-10-08 |
| 273 | `2026-09-24_enterprise-release/review/65` | scheduled-fold | scheduled to u2-review-gate-all (docs/plans/016-fork-distribution-02.md); inbox pass 2026-10-08 |
| 274 | `2026-09-24_enterprise-release/build/33` | fix-in-session | fixed in f0197b8a and the route of record's driver (the comparator keys a configuration by the client version); inbox pass 2026-10-08 |
| 275 | `2026-09-24_enterprise-release/review/78` | fix-in-session | fixed in f0197b8a and the route of record's driver (composition keyed by the harness; REQ-PROVE-033 names the harness among its triggers); inbox pass 2026-10-08 |
| 276 | `2026-09-24_enterprise-release/review/79` | cut | cut: a test-shape gap in the private driver: the export path is read-verified and no run has shown a wrong Not done line; nothing observable fails; inbox pass 2026-10-08 |
| 277 | `2026-09-24_enterprise-release/build/42` | cut | cut: a load-only flake: the cases pass alone and on an uncontended full run, and CI runs one suite per checkout, so no required check is affected; inbox pass 2026-10-08 |
| 278 | `2026-09-24_enterprise-release/build/55` | cut | cut: effort is fixed by the model profile sha pin, so two runs at different efforts cannot share one profile; the missing key field changes no comparison today; inbox pass 2026-10-08 |
| 279 | `2026-09-24_enterprise-release/build/80` | cut | cut: same flake as build/42: another lane rebuilding this checkout's dist/cli.js mid-run; worktree lanes build their own dist and CI never shares one; inbox pass 2026-10-08 |
| 280 | `2026-09-24_enterprise-release/build/82` | cut | cut: same flake as build/42 and build/80: dist/cli.js briefly missing under concurrent lanes in one checkout; green alone and uncontended, never in CI; inbox pass 2026-10-08 |
| 281 | `2026-09-24_enterprise-release/review/124` | cut | cut: K3 and K3ai are replay canaries; the replay was retired on 2026-09-29, so no driver revision for its fingerprint row will run; inbox pass 2026-10-08 |
| 282 | `2026-09-24_enterprise-release/review/125` | cut | cut: all four clients render the guard from one source and the Claude render is the largest, so timing it bounds the others; no budget miss is hidden; inbox pass 2026-10-08 |
| 283 | `2026-09-24_enterprise-release/review/144` | fixed | fixed in 2e2c3212 (citations re-pointed to d227ca57; the spec names the tree every citation reads at); inbox pass 2026-10-08 |
| 284 | `2026-09-24_enterprise-release/review/149` | scheduled | scheduled to u1-manifest-stable (docs/plans/016-fork-distribution-01.md); inbox pass 2026-10-08 |
| 300 | `2026-09-28_replay-v2/build/1` | scheduled | scheduled to b4-daily-use (docs/plans/017-docs-overhaul-02.md); inbox pass 2026-10-08 |
| 306 | `docs/plans/013-optimization-sweep-03.md` | fixed | fixed in c419eab1 (short ids on close, an idempotent --stdin append, sizes named in refusals); the salvage mode cut below the floor; inbox pass 2026-10-08 |
| 307 | `docs/plans/013-optimization-sweep-03.md` | cut | cut: a trigger-only row: no user has reported shell prompts from a /st-rework or /st-pr-resolve record, and nothing fails until one does; inbox pass 2026-10-08 |
| 315 | `2026-09-30_optimization-sweep/build/11` | fix-in-session | fixed in 6482b38d (the carry suffix prints only beside a row carried forward); inbox pass 2026-10-08 |
| 317 | `2026-09-30_optimization-sweep/review/57` | cut | cut: two debug runs in one tree at once is the only case where the repo-wide wording and the run-id count differ; the close already counts by run id (:167-168); inbox pass 2026-10-08 |
| 320 | `2026-09-30_optimization-sweep/build/85` | cut | cut: the classifier fails closed (aggregator red) and no records-only pull request has run yet; plan 014 r5-ci-records-job retires the lane before one is likely; inbox pass 2026-10-08 |
| 321 | `2026-09-30_optimization-sweep/build/105` | cut | cut: the learning's advice (sync after a content edit) stays right; it only overstates the gap, since CI's Dogfood check catches a stale .claude/agents copy; inbox pass 2026-10-08 |
| 322 | `2026-09-30_optimization-sweep/build/106` | cut | cut: the core claim holds and only the command spelling is dated; t9-repo-gate-coverage makes the local gate the coverage run, which is this learning's own retire condition; inbox pass 2026-10-08 |
| 323 | `2026-09-30_optimization-sweep/build/110` | cut | cut: the 0.8 fallback equals the high word gate, so the page is never more generous than the loop; the gap only makes it stricter for a low-confidence approval with no stated gate; inbox pass 2026-10-08 |
| 324 | `2026-09-30_optimization-sweep/build/124` | fix-in-session | fixed in 1d7d19ce and 01e1ca53 (the emitted settings pre-approve no tool on either route; the permissions type collision still reported); inbox pass 2026-10-08 |
| 325 | `2026-09-30_optimization-sweep/build/125` | cut | cut: the column states the watched client's oldest source date as a staleness bound, not a per-trigger read date; the row's status text makes no claim that page re-reads would change; inbox pass 2026-10-08 |
| 326 | `2026-09-30_optimization-sweep/build/128` | scheduled | scheduled to u2-repo-file-waste (docs/plans/016-fork-distribution-02.md); inbox pass 2026-10-08 |
| 327 | `2026-09-30_optimization-sweep/build/132` | scheduled-fold | scheduled to u1-copilot-setup-steps (docs/plans/016-fork-distribution-01.md); inbox pass 2026-10-08 |
| 328 | `2026-09-30_optimization-sweep/review/170` | scheduled-fold | scheduled to u2-upgrade-verb (docs/plans/016-fork-distribution-02.md); inbox pass 2026-10-08 |
| 329 | `2026-09-30_optimization-sweep/prove/16` | scheduled | scheduled to u1-fork-neutral-tests (docs/plans/016-fork-distribution-01.md); inbox pass 2026-10-08 |
| 330 | `2026-09-30_optimization-sweep/review/171` | fixed | fixed in eca323e8 (a --registry fork's pinned calls carry --@<scope>:registry=<url>, so no consumer scope mapping is needed); inbox pass 2026-10-08 |
| 331 | `2026-09-30_optimization-sweep/review/172` | scheduled | scheduled to u2-main-catalogs (docs/plans/016-fork-distribution-02.md); inbox pass 2026-10-08 |
| 336 | `2026-09-30_release-1-11-0/review/8` | fixed | fixed in 83c77d95 (the st-setup body says clean -y deletes the whole .stamity/ directory, naming learnings, handoffs, overrides, run records and packs; eval case moved); inbox pass 2026-10-08 |
| 337 | `2026-09-30_release-1-11-0/review/34` | fix-in-session | fixed in 4dcedb41 and 60722bef (the run of record named in evals/run-of-record.json, its results file read only when a reader needs it); inbox pass 2026-10-08 |
| 338 | `2026-09-30_release-1-11-0/build/4` | scheduled | scheduled to b2-front-door (docs/plans/017-docs-overhaul-02.md); inbox pass 2026-10-08 |
| 339 | `2026-09-30_release-1-11-0/prove/5` | fixed | fixed in e6cc66b6 (the case was wrong: B4 reworded for a sealed turn); 3/3 in the 1.12.0 full run 42; inbox pass 2026-10-08 |
| 340 | `2026-09-30_release-1-11-0/prove/6` | fixed | fixed in e6cc66b6 (the case was wrong: source widened to the single-writer lines, B6 and B1 reworded); 3/3 in the 1.12.0 full run 42; inbox pass 2026-10-08 |
| 341 | `2026-09-30_release-1-11-0/prove/7` | fixed | fixed in e6cc66b6 (researcher and plugin-mode cases) and bf569351 (st-ask band placement); each case 3/3 in run 42; inbox pass 2026-10-08 |
| 342 | `2026-09-30_release-1-11-0/frame/7` | scheduled | scheduled to u3-release-1-12-0 (docs/plans/016-fork-distribution-03.md); inbox pass 2026-10-08 |
| 343 | `2026-09-30_release-1-11-0/review/46` | cut | cut: a hypothetical exporter wording; the exporter's current section 5 wording reads correctly on the page, and a wording change would show on the generated page's diff; inbox pass 2026-10-08 |
| 344 | `2026-09-30_release-1-11-0/prove/9` | fix-in-session | fixed in 4dcedb41 and 60722bef (a release run's version read off a dashed run name, so 1.11.0 and 1.12.0 carry their merge evidence); inbox pass 2026-10-08 |
| 345 | `2026-09-30_release-1-11-0/review/47` | cut | cut: a vacuous-on-empty loop and a misnamed case in a test file; the snapshot numerator is non-empty today, so no regression is hidden; inbox pass 2026-10-08 |
| 346 | `docs/plans/014-lean-repository-01.md` | cut | cut: a fork's CI cadence is the fork's own setting; plan 014's drop list holds the guard until a fork asks (docs/plans/014-lean-repository-01.md:324); inbox pass 2026-10-08 |
| 347 | `docs/plans/014-lean-repository-02.md` | scheduled | scheduled to u2-apm-slim-package (docs/plans/016-fork-distribution-02.md); inbox pass 2026-10-08 |
| 348 | `docs/plans/014-lean-repository-02.md` | scheduled | scheduled to u2-apm-sparse-measure and u2-apm-slim-package (docs/plans/016-fork-distribution-02.md); inbox pass 2026-10-08 |
| 349 | `docs/plans/014-lean-repository-02.md` | scheduled-fold | scheduled to r4-records-script (docs/plans/014-lean-repository-02.md); inbox pass 2026-10-08 |
| 350 | `docs/plans/014-lean-repository-02.md` | scheduled | scheduled to u3-route-guide (docs/plans/016-fork-distribution-03.md) and b2-front-door (docs/plans/017-docs-overhaul-02.md); inbox pass 2026-10-08 |
| 351 | `docs/plans/014-lean-repository-02.md` | cut | cut: plan 014 records the no-symlinks fact as a settled decision (014-02:60-61), and a symlinked folder is refused loudly by each writer, so no silent failure waits; inbox pass 2026-10-08 |
| 352 | `docs/plans/015-board-writes.md` | cut | cut: session-carried is plan 015's walked decision (015-board-writes.md:48); one setup command per session is the cost, and nothing fails; inbox pass 2026-10-08 |
| 353 | `docs/plans/015-board-writes.md` | scheduled | scheduled to u3-release-1-12-0 (docs/plans/016-fork-distribution-03.md); inbox pass 2026-10-08 |
| 359 | `docs/plans/016-fork-distribution-02.md` | cut | cut: deliberate drop-list item (brief C1 part 2); plan 016 keeps it off every unit; nothing breaks until a fleet orchestrator asks to auto-merge on it; inbox pass 2026-10-08 |
| 360 | `docs/plans/016-fork-distribution-02.md` | cut | cut: unbuilt fleet feature; plugin status takes one --plugin-root by design, so no passed value is dropped; nothing fails until a fleet needs wider version visibility; inbox pass 2026-10-08 |
| 361 | `docs/plans/016-fork-distribution-01.md` | cut | cut: deliberate drop-list item (brief F3); a manual tag push still releases a fork; nothing fails until a fork asks for lane-merge releases; inbox pass 2026-10-08 |
| 362 | `docs/plans/016-fork-distribution-02.md` | cut | cut: unbuilt feature (brief P15); one install mode per repository works for every supported client today; nothing fails until an organization mixes the plugin with those IDEs; inbox pass 2026-10-08 |
| 363 | `docs/plans/016-fork-distribution-03.md` | cut | cut: unbuilt feature (brief C11); its engine half shipped in 1.12.0 as check --expect-*; nothing fails until a second enterprise asks for a packaged check action; inbox pass 2026-10-08 |
| 364 | `docs/plans/016-fork-distribution-03.md` | cut | cut: unbuilt feature (brief C13); the rollout pattern is documented by plan 016 file 3; nothing fails until a second organization asks; inbox pass 2026-10-08 |
| 365 | `docs/plans/016-fork-distribution-03.md` | cut | cut: unbuilt host support (brief F6); public-GitHub-only is the stated scope; nothing fails for a supported host until an organization on GHES or data residency asks; inbox pass 2026-10-08 |
| 366 | `docs/plans/016-fork-distribution-01.md` | cut | cut: unbuilt runtime option (brief C9); Node on PATH is a documented requirement and the hooks fail closed without it; nothing new fails until an organization cannot provide Node; inbox pass 2026-10-08 |
| 367 | `docs/plans/016-fork-distribution-02.md` | cut | cut: unbuilt packaging option (brief A9); the one APM package plus the charter package serves every route; nothing fails until an organization asks for leaf packages; inbox pass 2026-10-08 |
| 368 | `docs/plans/016-fork-distribution-02.md` | cut | cut: held on plan 016 file 2's drop list until the Cursor hooks-shape fix ships in an apm-cli release; u2-apm-deliveries reports others' hooks meanwhile; nothing breaks by waiting; inbox pass 2026-10-08 |
| 369 | `docs/plans/016-fork-distribution-02.md` | cut | cut: unbuilt pattern (brief A8); the fork layer stays the documented customization path for APM; nothing fails until someone asks; inbox pass 2026-10-08 |
| 370 | `docs/plans/016-fork-distribution-03.md` | cut | cut: unbuilt feature (brief C8); committed overrides cover customization today; nothing fails until someone asks for a personal layer; inbox pass 2026-10-08 |
| 371 | `docs/plans/016-fork-distribution-02.md` | cut | cut: unbuilt test matrix (brief C4); a manifest needing a same-version CLI is the documented contract; nothing fails until a release breaks a skewed pair; inbox pass 2026-10-08 |
| 372 | `docs/plans/016-fork-distribution-03.md` | cut | cut: the Renovate part moved to u2-apm-coexistence-fork; the rest waits on service accounts that do not exist, and nothing fails meanwhile; inbox pass 2026-10-08 |
| 373 | `docs/plans/016-fork-distribution-03.md` | cut | cut: unbuilt script (brief F5); file 3's settings guide lists the settings by hand; nothing fails until a second organization asks; inbox pass 2026-10-08 |
| 374 | `docs/plans/016-fork-distribution-01.md` | scheduled-fold | scheduled to u1-fork-neutral-tests (docs/plans/016-fork-distribution-01.md); inbox pass 2026-10-08 |
| 375 | `docs/plans/016-fork-distribution-01.md` | scheduled-fold | scheduled to u1-renovate-suffix (docs/plans/016-fork-distribution-01.md); inbox pass 2026-10-08 |
| 376 | `docs/plans/016-fork-distribution-01.md` | scheduled | scheduled to u1-secret-shaped-fixtures (docs/plans/016-fork-distribution-01.md); inbox pass 2026-10-08 |
| 377 | `docs/plans/016-fork-distribution-01.md` | scheduled | scheduled to u1-renovate-suffix (docs/plans/016-fork-distribution-01.md); inbox pass 2026-10-08 |
| 378 | `docs/plans/016-fork-distribution-01.md` | cut | cut: the row itself says harmless while canonical versions are never prereleases; no canonical release-candidate version exists, so no publish fails; inbox pass 2026-10-08 |
| 379 | `docs/plans/016-fork-distribution-01.md` | cut | cut: STAMITY_RELEASE_DIST_TAG is not built yet (u1-npm-dist-tag), and REQ-PLUGIN-031 states the notice reads latest as the documented limit; nothing breaks beyond that stated limit; inbox pass 2026-10-08 |
| 380 | `docs/plans/016-fork-distribution-01.md` | scheduled | scheduled to u1-import-config-round-trip (docs/plans/016-fork-distribution-01.md); inbox pass 2026-10-08 |
| 381 | `docs/plans/016-fork-distribution-01.md` | scheduled | scheduled to u1-node-missing-hint (docs/plans/016-fork-distribution-01.md); inbox pass 2026-10-08 |
| 382 | `docs/plans/016-fork-distribution-01.md` | scheduled | scheduled to u1-manifest-stable (docs/plans/016-fork-distribution-01.md) for the .codex/hooks.json half; the rest cut: the remaining pinned calls are the design; inbox pass 2026-10-08 |
| 383 | `docs/plans/016-fork-distribution-01.md` | cut | cut: check's preserved-duplicate row names the doubled charter, and removing the second copy by hand clears it; u1-init-force-charter stops new doubling; nothing else fails; inbox pass 2026-10-08 |
| 384 | `docs/plans/016-fork-distribution-01.md` | fixed | fixed in aa08babb (settings.json owned per entry; a merged document keeps its own indentation, key order, line ending and final newline); inbox pass 2026-10-08 |
| 385 | `docs/plans/016-fork-distribution-01.md` | cut | cut: a spurious .bak on drift loses nothing: the owner's bytes are kept in the backup and the pruned inputs row was the engine's; inbox pass 2026-10-08 |
| 386 | `docs/plans/016-fork-distribution-01.md` | fixed | fixed in fa8c6175 (.codex/config.toml owned table by table; another tool's tables survive sync and clean, and an edited engine table becomes the owner's); key-level ownership inside an engine table cut below the floor; inbox pass 2026-10-08 |
| 387 | `docs/plans/016-fork-distribution-01.md` | cut | cut: the stale .env.mcp line is the operator's file and the next sync settles it; a leftover variable does nothing; inbox pass 2026-10-08 |
| 388 | `docs/plans/016-fork-distribution-01.md` | cut | cut: the collision skip names the --force step, and u1-init-force-charter makes that path recognise the engine's charter; one extra flag, nothing lost; inbox pass 2026-10-08 |
| 390 | `docs/plans/016-fork-distribution-02.md` | scheduled | scheduled to u2-apm-slim-package (docs/plans/016-fork-distribution-02.md); inbox pass 2026-10-08 |
| 391 | `docs/plans/016-fork-distribution-02.md` | cut | cut: a small inert companion file reaches APM consumers; no client misreads it, and apm-cli offers no filter, so nothing fails; inbox pass 2026-10-08 |
| 392 | `docs/plans/016-fork-distribution-02.md` | scheduled-fold | scheduled to u2-apm-placeholders (docs/plans/016-fork-distribution-02.md); inbox pass 2026-10-08 |
| 393 | `docs/plans/016-fork-distribution-02.md` | scheduled-fold | scheduled to u2-apm-charter (docs/plans/016-fork-distribution-02.md); inbox pass 2026-10-08 |
| 394 | `docs/plans/016-fork-distribution-02.md` | scheduled | scheduled to u2-upgrade-verb (docs/plans/016-fork-distribution-02.md); inbox pass 2026-10-08 |
| 395 | `docs/plans/016-fork-distribution-02.md` | scheduled-fold | scheduled to u2-apm-coexistence-fork (docs/plans/016-fork-distribution-02.md); inbox pass 2026-10-08 |
| 396 | `docs/plans/016-fork-distribution-02.md` | cut | cut: a fallback kept for consumers without a lock still reads correctly; retiring it is cleanup with no failure behind it; inbox pass 2026-10-08 |
| 397 | `docs/plans/016-fork-distribution-02.md` | cut | cut: old-spec consumers keep installing the root copy through the compatibility window u2-apm-slim-package declares, so nothing fails while the redirect stays unmeasured; inbox pass 2026-10-08 |
| 398 | `docs/plans/016-fork-distribution-02.md` | scheduled | scheduled to u2-review-gate-all (docs/plans/016-fork-distribution-02.md); inbox pass 2026-10-08 |
| 399 | `docs/plans/016-fork-distribution-02.md` | scheduled-fold | scheduled to u2-main-catalogs (docs/plans/016-fork-distribution-02.md); inbox pass 2026-10-08 |
| 400 | `docs/plans/016-fork-distribution-02.md` | scheduled-fold | scheduled to u2-review-gate-all (docs/plans/016-fork-distribution-02.md); inbox pass 2026-10-08 |
| 401 | `docs/plans/016-fork-distribution-02.md` | cut | cut: the cited Cursor pages redirect to their new paths, so every citation still resolves; inbox pass 2026-10-08 |
| 402 | `docs/plans/016-fork-distribution-02.md` | cut | cut: an unprobed convenience; the per-contributor plugin install is the documented and working route, so nothing fails; inbox pass 2026-10-08 |
| 403 | `docs/plans/016-fork-distribution-02.md` | cut | cut: clean-then-setup changes the channel today; a config route is convenience with no failure behind it; inbox pass 2026-10-08 |
| 404 | `docs/plans/016-fork-distribution-02.md` | scheduled | scheduled to u2-hooks-self-filter-vscode (docs/plans/016-fork-distribution-02.md); inbox pass 2026-10-08 |
| 405 | `docs/plans/016-fork-distribution-03.md` | cut | cut: docs/choose-a-route.md does not exist yet (u3-route-guide writes it); dated measurements labelled as dated mislead no one; inbox pass 2026-10-08 |
| 406 | `docs/plans/016-fork-distribution-03.md` | cut | cut: the reset recipe is a bash recipe and its test does not exist yet (u3-reset-guide); a Windows twin adds no proof for the documented shell; inbox pass 2026-10-08 |
| 407 | `docs/plans/016-fork-distribution-03.md` | scheduled-fold | scheduled to u3-reset-guide (docs/plans/016-fork-distribution-03.md); inbox pass 2026-10-08 |
| 408 | `docs/plans/016-fork-distribution-03.md` | cut | cut: unrun live legs are reported under Not done: by design (S9), so no leg reads green falsely; they wait on accounts that do not exist; inbox pass 2026-10-08 |
| 409 | `docs/plans/016-fork-distribution-03.md` | cut | cut: a long guide is still correct; splitting it is docs housekeeping with no failure behind it; inbox pass 2026-10-08 |
| 410 | `docs/plans/016-fork-distribution-03.md` | cut | cut: a person walks the VS Code leg at every release, so the leg is proved; automating it saves time but nothing fails; inbox pass 2026-10-08 |
| 411 | `docs/plans/016-fork-distribution-03.md` | cut | cut: keeping --scope project works on every client; retiring it waits on the client floor, and nothing fails meanwhile; inbox pass 2026-10-08 |
| 423 | `2026-10-01_pr73-review-round-1/review/10` | scheduled | scheduled to u3-reset-guide (docs/plans/016-fork-distribution-03.md); inbox pass 2026-10-08 |
| 424 | `2026-10-01_pr73-review-round-1/review/11` | scheduled | scheduled to b4-eval-cases (docs/plans/015-board-writes.md); inbox pass 2026-10-08 |
| 425 | `2026-10-01_pr73-review-round-1/review/12` | scheduled | scheduled to u2-apm-floor-current (docs/plans/016-fork-distribution-02.md); inbox pass 2026-10-08 |
| 426 | `2026-10-01_pr73-review-round-1/prove/1` | scheduled-fold | scheduled to p8-capture-by-consequence (docs/plans/019-lean-flows-02.md); inbox pass 2026-10-08 |
| 433 | — | cut | cut: the always-on question protocol already binds every question a run asks, so an unattended run returns BLOCKED_AMBIGUITY as designed; the plan text restating it changes nothing; inbox pass 2026-10-08 |
| 434 | — | scheduled-fold | scheduled to REQ-BOARD-004's section, Package 19 intake (docs/plans/015-board-writes.md); inbox pass 2026-10-08 |
| 435 | — | scheduled-fold | scheduled to pickup step 5 under REQ-BOARD-005, Package 19 intake (docs/plans/015-board-writes.md); inbox pass 2026-10-08 |
| 436 | — | scheduled-fold | scheduled to setup step 2, Package 19 intake (docs/plans/015-board-writes.md); inbox pass 2026-10-08 |
| 437 | — | cut | cut: the pull request's CI runs every gate on the committed tree after Prove's spec merge, so an ungated tree cannot reach main; inbox pass 2026-10-08 |
| 438 | — | cut | cut: a dist-tag such as v1-next is refused with a named error before publish, and a fork picks another channel name; the stricter rule fails closed; inbox pass 2026-10-08 |
| 439 | — | scheduled-fold | scheduled to u1-foreign-paths (docs/plans/016-fork-distribution-01.md); inbox pass 2026-10-08 |
| 440 | — | cut | cut: past 1000 open issues an old lane issue stays open, the same state as today with no close step; nothing is closed wrongly; inbox pass 2026-10-08 |
| 441 | — | scheduled-fold | scheduled to u1-lane-issues-freshness (docs/plans/016-fork-distribution-01.md); inbox pass 2026-10-08 |
| 442 | — | scheduled | scheduled to u1-lane-issues-freshness (docs/plans/016-fork-distribution-01.md); inbox pass 2026-10-08 |
| 443 | — | scheduled | scheduled to u2-upgrade-verb (docs/plans/016-fork-distribution-02.md); inbox pass 2026-10-08 |
| 444 | — | scheduled | scheduled to u2-channels-promote (docs/plans/016-fork-distribution-02.md); inbox pass 2026-10-08 |
| 445 | — | scheduled | scheduled to u2-channels-promote (docs/plans/016-fork-distribution-02.md); inbox pass 2026-10-08 |
| 446 | — | scheduled | scheduled to u2-apm-backed-mode (docs/plans/016-fork-distribution-02.md); inbox pass 2026-10-08 |
| 447 | — | scheduled | scheduled to u3-reset-guide (docs/plans/016-fork-distribution-03.md); inbox pass 2026-10-08 |
| 448 | — | scheduled | scheduled to u3-reset-guide (docs/plans/016-fork-distribution-03.md); inbox pass 2026-10-08 |
| 449 | — | scheduled | scheduled to u3-reset-guide (docs/plans/016-fork-distribution-03.md); inbox pass 2026-10-08 |
| 455 | `docs/plans/017-docs-overhaul-01.md` | scheduled-fold | scheduled to Package 20 file 1 intake, no unit yet (docs/plans/016-fork-distribution-01.md, its inbox fold table); inbox pass 2026-10-08 |
| 456 | `docs/plans/017-docs-overhaul-01.md` | scheduled-fold | scheduled to Package 20 file 1 intake, no unit yet (docs/plans/016-fork-distribution-01.md, its inbox fold table); inbox pass 2026-10-08 |
| 457 | `docs/plans/017-docs-overhaul-01.md` | scheduled | scheduled to a0-intake (docs/plans/017-docs-overhaul-01.md); inbox pass 2026-10-08 |
| 458 | `docs/plans/017-docs-overhaul-01.md` | cut | cut: no docs URL has changed and plan 017 changes none (S2), so no reader meets a dead link without the plugin; inbox pass 2026-10-08 |
| 459 | `docs/plans/017-docs-overhaul-01.md` | cut | cut: a feature idea with weak demand evidence; the .md copies already serve every llms.txt target, so nothing goes wrong without it; inbox pass 2026-10-08 |
| 460 | `docs/plans/017-docs-overhaul-01.md` | cut | cut: a feature idea with no reported reader struggle; config list already prints every resolved key; inbox pass 2026-10-08 |
| 461 | `docs/plans/017-docs-overhaul-02.md` | cut | cut: a feature idea gated on anchors plan 017 file 2 has not built; check already prints each failing row's remedy; inbox pass 2026-10-08 |
| 462 | `docs/plans/017-docs-overhaul-01.md` | cut | cut: page length only; the 1.12.0 cut passed without the trim and the page still holds its pinned route and comparison; inbox pass 2026-10-08 |
| 469 | — | scheduled-fold | scheduled to c4-publish-close (docs/plans/017-docs-overhaul-03.md); inbox pass 2026-10-08 |
| 470 | — | scheduled-fold | scheduled to c4-publish-close (docs/plans/017-docs-overhaul-03.md); inbox pass 2026-10-08 |
| 471 | — | scheduled-fold | scheduled to c4-publish-close (docs/plans/017-docs-overhaul-03.md); inbox pass 2026-10-08 |
| 472 | — | cut | cut: a one-run process slip on a verbatim edit with green gates; st-work.md:168 already makes each dispatch carry its learnings, so nothing recurs from the record line; inbox pass 2026-10-08 |
| 479 | `docs/plans/016-fork-distribution-02.md` | scheduled | scheduled to u2-copilot-touchpoints (docs/plans/016-fork-distribution-02.md); inbox pass 2026-10-08 |
| 481 | `2026-10-03_pack-engine-defects/prove/2` | scheduled-fold | scheduled to Package 19 session step 2 (docs/plans/015-board-writes.md, its execution order); the probe half to u3-rollout-guides (docs/plans/016-fork-distribution-03.md); inbox pass 2026-10-08 |
| 482 | `2026-10-03_pack-engine-defects/review/35` | cut | cut: extra content walks cost time with no declared latency budget and no reported slowness; nothing fails, so the Warning label overstated it; inbox pass 2026-10-08 |
| 483 | `2026-10-03_pack-engine-defects/review/36` | cut | cut: the duplicate plan in check's pack-reach row costs one extra plan per check run; the result is correct; inbox pass 2026-10-08 |
| 484 | `2026-10-03_pack-engine-defects/build/20` | fix-in-session | fixed in 23dca19a and 14ee4fe6 (the Cursor walk's skill listing retried once, only after a clean first listing); inbox pass 2026-10-08 |
| 485 | `2026-10-03_pack-engine-defects/review/2` | cut | cut: only a pack companion using a YAML merge key can under-count, and Codex shortens an overflowing list itself; inbox pass 2026-10-08 |
| 486 | `2026-10-03_pack-engine-defects/review/54` | fixed | fixed in eca323e8 (the Codex skills-list refusal prints the pinned clean --pack call, src/adapters/codex.ts:743); inbox pass 2026-10-08 |
| 487 | `2026-10-03_pack-engine-defects/review/53` | fixed | fixed in eca323e8 (clean --pack's next step prints the pinned packageCommand form, src/cli/commands/clean.ts:583); inbox pass 2026-10-08 |
| 488 | `2026-10-03_pack-engine-defects/review/46` | cut | cut: applyPackInstall's only caller is the add CLI, which refuses name clashes and left-behind files before it calls; no path installs a clash; inbox pass 2026-10-08 |
| 489 | `2026-10-03_pack-engine-defects/review/16` | cut | cut: the error still names the failing file and add refuses; only the wording of why add read it is missing; inbox pass 2026-10-08 |
| 490 | `2026-10-03_pack-engine-defects/review/55` | cut | cut: needs an operator edit inside an installed pack, then clean --pack, then a re-add of a version that drops that file; the kept file is the operator's own and clean counts it as salvage; inbox pass 2026-10-08 |
| 492 | `2026-10-03_pack-engine-defects/review/49` | cut | cut: pack-reach is a report row; an overridden pack artifact's id still reaches the client, with the override's bytes; inbox pass 2026-10-08 |
| 493 | `2026-10-03_pack-engine-defects/review/24` | cut | cut: needs a manifest with no rule list, rule demotion and a clashing name at once; no such failure was observed; inbox pass 2026-10-08 |
| 495 | `2026-10-03_pack-engine-defects/review/3` | cut | cut: wording in the creator's lead-in; both bullets already say 'not on a pack skill', so the chain reads correctly; inbox pass 2026-10-08 |
| 497 | `.stamity/runs/2026-10-03_pack-engine-defects/record.md` | scheduled-fold | scheduled to p8-capture-by-consequence (docs/plans/019-lean-flows-02.md); inbox pass 2026-10-08 |
| 498 | `.stamity/runs/2026-10-03_debug-pack-defects/record.md` | scheduled-fold | scheduled to r7-remove-records-from-main (docs/plans/014-lean-repository-02.md); inbox pass 2026-10-08 |
| 499 | `2026-10-03_pack-engine-defects/review/1` | cut | cut: a test-shape gap in the ops pack suite; the ops pack retires in Package 22, and no wrong-class mention exists today; inbox pass 2026-10-08 |
| 500 | `2026-10-03_pack-engine-defects/review/11` | cut | cut: wording only: the migrate prompt label still says 'defaults'; behaviour matches docs/migration.md; inbox pass 2026-10-08 |
| 501 | `2026-10-03_pack-engine-defects/build/30` | fixed | fixed in 75fe084a (plan 016's amendment counts fifteen rows with pack-reach in u2-apm-floor-current and u2-review-gate-all); inbox pass 2026-10-08 |
| 502 | `docs/plans/016-fork-distribution-03.md` | fixed | fixed in 75fe084a (REQ-PLUGIN-044 retitled in the amendment at docs/plans/016-fork-distribution-03.md:289-293); inbox pass 2026-10-08 |
| 503 | `docs/plans/017-docs-overhaul-03.md` | cut | cut: a weighting note on the c4 :221 Warning row, which carries the defect itself; settling that row settles this one; inbox pass 2026-10-08 |
| 504 | `docs/plans/017-docs-overhaul-02.md` | cut | cut: the b8 test is proved red first, so the builder meets the blockquote markers on the first run and strips them; inbox pass 2026-10-08 |
| 505 | `docs/plans/017-docs-overhaul-03.md` | scheduled-fold | scheduled to c4-publish-close (docs/plans/017-docs-overhaul-03.md); inbox pass 2026-10-08 |
| 511 | `2026-10-06_security-alerts/build/1` | cut | cut: no patched http-cache-semantics exists (alerts #23 and #27 open, first patched none on 2026-10-08); Dependabot raises the refresh once one is named; inbox pass 2026-10-08 |
| 512 | `2026-10-06_security-alerts/review/3` | cut | cut: the overrides hold fixed versions today; retiring them later is housekeeping, and a future ^8 consumer would fail loudly at install; inbox pass 2026-10-08 |
| 520 | `docs/plans/016-fork-distribution-00.md` | cut | cut: only a fork consuming through a mirror is affected, no such fork exists, and the call fails closed at the publish registry rather than reaching the public one; inbox pass 2026-10-08 |
| 521 | `docs/plans/016-fork-distribution-02.md` | scheduled | scheduled to u2-main-catalogs (docs/plans/016-fork-distribution-02.md); inbox pass 2026-10-08 |
| 522 | `docs/plans/016-fork-distribution-00.md` | scheduled-fold | scheduled to Package 20 file 1 intake, beside u1-clean-keeps-state (docs/plans/016-fork-distribution-01.md, its inbox fold table); inbox pass 2026-10-08 |
| 523 | `docs/plans/016-fork-distribution-00.md` | scheduled-fold | scheduled to u1-manifest-stable (docs/plans/016-fork-distribution-01.md); inbox pass 2026-10-08 |
| 524 | `docs/plans/016-fork-distribution-00.md` | fixed | fixed in 249f3fa7 (clean --pack keeps every hook script a kept hooks document still runs, so no failClosed guard points at a missing script); the hooks-document remainder re-filed as 2026-10-08_inbox-pass/pass/1; inbox pass 2026-10-08 |
| 525 | `docs/plans/016-fork-distribution-00.md` | cut | cut: per-table ownership is the shipped design (fa8c6175); an owner who edits inside an engine table takes it over by choice, and sync warns 'Kept your [table]' on each run; inbox pass 2026-10-08 |
| 526 | `docs/plans/016-fork-distribution-00.md` | cut | cut: a doubled hook run follows only a hand edit of a rendered settings entry instead of its .stamity/hooks/ definition; nothing is lost and the edit is undone at the definition; inbox pass 2026-10-08 |
| 527 | `docs/plans/016-fork-distribution-00.md` | cut | cut: only after a lost manifest; the rows clean leaves are Read, Grep and Glob, read-only tool grants; inbox pass 2026-10-08 |
| 528 | `docs/plans/016-fork-distribution-00.md` | fixed | fixed in 7f933927 (check fails on a kept key turning Codex hooks off) and 075a8263 (hooks run by default, so a [features] table without hooks = true no longer disables them); inbox pass 2026-10-08 |
| 529 | `docs/plans/016-fork-distribution-01.md` | cut | cut: two closed plan-record lines keep a credential-shaped example; no scanner reports them and they carry no real credential; inbox pass 2026-10-08 |
| 530 | `docs/plans/016-fork-distribution-01.md` | cut | cut: a fork meets at most a text merge conflict it resolves by hand; no fork has reported one; inbox pass 2026-10-08 |
| 531 | `docs/plans/016-fork-distribution-01.md` | cut | cut: S27's rulesets-only declaration already gives a fork a route without Administration read; the opt-in permission waits for a request; inbox pass 2026-10-08 |
| 532 | `docs/plans/016-fork-distribution-01.md` | cut | cut: the visibility read is a planned S22 step (016-01:88, :421-423), not on main; a refused read only warns, and recording the first armed run's answer changes no behaviour; inbox pass 2026-10-08 |
| 533 | `docs/plans/016-fork-distribution-01.md` | cut | cut: the red scheduled runs are the signal by design; an issue per moved tag is an optional convenience; inbox pass 2026-10-08 |
| 534 | `docs/plans/016-fork-distribution-01.md` | cut | cut: the cap of 4 comes from a measurement and belongs to an unbuilt unit (S28); re-deriving it later changes speed, not results; inbox pass 2026-10-08 |
| 535 | `docs/plans/016-fork-distribution-01.md` | cut | cut: the other gates refuse a secret reference as a false positive the author rewords; the failure is on the strict side, so nothing leaks or passes; inbox pass 2026-10-08 |
| 536 | `docs/plans/016-fork-distribution-01.md` | cut | cut: backups are git-ignored and small; nothing fails while they accumulate; inbox pass 2026-10-08 |
| 537 | `docs/plans/016-fork-distribution-01.md` | cut | cut: the case reads tamper (exit 1) with a sync remedy; loud and recoverable, never a silent pass; inbox pass 2026-10-08 |
| 538 | `docs/plans/016-fork-distribution-01.md` | cut | cut: tamper on a pending reclaim is the declared design so no deletion rides an automated re-sync; inbox pass 2026-10-08 |
| 539 | `docs/plans/016-fork-distribution-01.md` | cut | cut: the text match is the named residue of planned u1-node-missing-hint (016-01:1781-1782), not on main; Claude Code serialises the identity as plain ASCII; inbox pass 2026-10-08 |
| 540 | `docs/plans/016-fork-distribution-01.md` | cut | cut: a dead branch in the portable runner; no emission reaches it and it changes no outcome; inbox pass 2026-10-08 |
| 541 | `docs/plans/016-fork-distribution-01.md` | scheduled | scheduled to u1-clean-keeps-state (docs/plans/016-fork-distribution-01.md); inbox pass 2026-10-08 |
| 543 | `docs/plans/016-fork-distribution-02.md` | cut | cut: u2-copilot-touchpoints states the Xcode limit in the capability matrix; no Xcode-only team exists; inbox pass 2026-10-08 |
| 544 | `docs/plans/016-fork-distribution-02.md` | cut | cut: a registry without the flag resolves fresh, as every release does today, and u2-release-integrity's post-publish step warns by name (016-02:2190); inbox pass 2026-10-08 |
| 545 | `docs/plans/016-fork-distribution-02.md` | cut | cut: the operator-typed pin works; a resolver is a convenience no fleet has asked for; inbox pass 2026-10-08 |
| 546 | `docs/plans/016-fork-distribution-02.md` | cut | cut: an unmeasured vendor precedence with no organization to measure on; nothing ships that depends on it; inbox pass 2026-10-08 |
| 547 | `docs/plans/016-fork-distribution-02.md` | cut | cut: consumers match the range today; a plain minimum is a convenience for the next schema bump; inbox pass 2026-10-08 |
| 548 | `docs/plans/016-fork-distribution-03.md` | cut | cut: an unpublished tag's tree is main's reviewed code, and REQ-UPSTREAM-030 has the next patch follow it; inbox pass 2026-10-08 |
| 549 | `docs/plans/016-fork-distribution-03.md` | cut | cut: S15's upload is planned (016-03:74); step 13 reads the immutable-releases setting first and falls back to the CHANGELOG link (016-03:1455), so a flip fails loudly; inbox pass 2026-10-08 |
| 550 | `docs/plans/016-fork-distribution-03.md` | cut | cut: an unmeasured refresh path that S7 keeps under Not done: until the auto-update legs exist; inbox pass 2026-10-08 |
| 551 | `docs/plans/016-fork-distribution-03.md` | cut | cut: u3-settings-constraints documents the unsigned lane merge from GitHub's page (016-03:1063); a probe would confirm a documented refusal and adds no behaviour; inbox pass 2026-10-08 |
| 552 | `docs/plans/016-fork-distribution-03.md` | cut | cut: the settings guide offers allowlisting the SHA or disabling both workflows (016-03:460-461); an unmeasured policy fails a run loudly at worst; inbox pass 2026-10-08 |
| 553 | `docs/plans/016-fork-distribution-01.md` | scheduled-fold | scheduled to f1-import-recipe (docs/plans/014-lean-repository-01.md); inbox pass 2026-10-08 |
| 554 | `docs/plans/016-fork-distribution-01.md` | cut | cut: the maintainer chose on 2026-10-06 not to build them; a fork releases by hand meanwhile; inbox pass 2026-10-08 |
| 555 | `docs/plans/016-fork-distribution-01.md` | cut | cut: Terraform detection is on plan 016's drop list (016-01:125); no fleet has asked; inbox pass 2026-10-08 |
| 561 | — | cut | cut: the reviewer missed the lane rule: publish never pushes a workflow change and opens an issue for a person instead, so Workflows write is never needed; the Warning was overstated; inbox pass 2026-10-08 |
| 562 | — | scheduled-fold | scheduled to u1-fork-attestations (docs/plans/016-fork-distribution-01.md); inbox pass 2026-10-08 |
| 563 | — | scheduled-fold | scheduled to u3-reset-guide (docs/plans/016-fork-distribution-03.md); inbox pass 2026-10-08 |
| 564 | `docs/plans/019-lean-flows-01.md` | fixed | fixed in 3760163f (the sample re-taken at 1.12.0 prints no learnings count, so no count can drift); inbox pass 2026-10-08 |
| 565 | `docs/plans/016-fork-distribution-02.md` | scheduled-fold | scheduled to u2-review-gate-all (docs/plans/016-fork-distribution-02.md); inbox pass 2026-10-08 |
| 572 | `docs/plans/019-lean-flows-02.md` | scheduled-fold | scheduled to p2-test-inputs (docs/plans/019-lean-flows-02.md) and q1-inbox-scoped (docs/plans/019-lean-flows-03.md); inbox pass 2026-10-08 |
| 573 | `docs/plans/019-lean-flows-02.md` | scheduled-fold | scheduled to p0-make-room (docs/plans/019-lean-flows-02.md); inbox pass 2026-10-08 |
| 574 | `docs/plans/019-lean-flows-02.md` | scheduled-fold | scheduled to p1-classify (docs/plans/019-lean-flows-02.md); inbox pass 2026-10-08 |
| 575 | `docs/plans/019-lean-flows-02.md` | scheduled-fold | scheduled to p5-security-trigger (docs/plans/019-lean-flows-02.md); inbox pass 2026-10-08 |
| 576 | `docs/plans/019-lean-flows-01.md` | fix-in-session | fixed in f0197b8a and 4083ad1a (the release eval's triggers name scripts/eval/** and every input the run of record hashes); inbox pass 2026-10-08 |
| 577 | `docs/plans/019-lean-flows-02.md` | scheduled-fold | scheduled to p4-loop-rules (docs/plans/019-lean-flows-02.md); inbox pass 2026-10-08 |
| 578 | `docs/plans/019-lean-flows-03.md` | scheduled-fold | scheduled to q2-qa-rows (docs/plans/019-lean-flows-03.md); inbox pass 2026-10-08 |
| 579 | `docs/plans/019-lean-flows-03.md` | scheduled-fold | scheduled to q1-inbox-scoped (docs/plans/019-lean-flows-03.md); inbox pass 2026-10-08 |
| 587 | `2026-10-07_security-fixes/build/46` | cut | cut: the owner's own server table is kept and runs, the correct result; only the notice first adoption gives is missing (fix: warn in the recorded state too, S); inbox pass 2026-10-08 |
| 589 | `2026-10-07_security-fixes/review/67` | cut | cut: the preview overstates a delete the real sweep keeps, so the error is on the safe side; no file is lost; inbox pass 2026-10-08 |
| 590 | `2026-10-07_security-fixes/review/85` | cut | cut: init --force leaves two unrecorded old guard scripts that nothing runs, and sync, the upgrade path, reclaims them; clutter only; inbox pass 2026-10-08 |
| 591 | `2026-10-07_security-fixes/build/28` | cut | cut: a forged record can only bloat the committed manifest with repeated lines; u1-gitignore-lines bounds each line to the engine's set (016-01:1460-1462), so no extra removal follows; inbox pass 2026-10-08 |
| 592 | `2026-10-07_security-fixes/build/56` | scheduled-fold | scheduled to u2-json-contract (docs/plans/016-fork-distribution-02.md); inbox pass 2026-10-08 |
| 593 | `2026-10-07_security-fixes/review/55` | cut | cut: the three copies differ only on an empty value the manifest refuses (repoPathDefect at manifest.ts:262, applied at :1008), so no run sees the disagreement; inbox pass 2026-10-08 |
| 594 | `2026-10-07_release-1-12-0/build/17` | cut | cut: the text is still true wherever the engine writes [features]; where an owner's table wins, hooks default on and check fails a kept off key (7f933927), so nothing goes wrong; the Warning overstated it; inbox pass 2026-10-08 |
| 595 | `.stamity/runs/2026-10-07_security-fixes/record.md` | fix-in-session | fixed in 23dca19a and 14ee4fe6 (the Cursor walk's skill listing retried once, only after a clean first listing); inbox pass 2026-10-08 |
| 596 | `.stamity/runs/2026-10-07_security-fixes/record.md` | scheduled-fold | scheduled to u1-fork-ci-job (docs/plans/016-fork-distribution-01.md); inbox pass 2026-10-08 |
| 597 | `.stamity/runs/2026-10-07_release-1-12-0/record.md` | fix-in-session | fixed in 441c7192, a9d7fbcd and the route of record's driver (the judge's blocks labelled, its transcript fenced, a bare Not done answer graded); inbox pass 2026-10-08 |
| 598 | `.stamity/runs/2026-10-07_security-fixes/record.md` | fix-in-session | fixed in 156283d0 and 077e8a78 on main (Dependabot #91 and #86 merged); inbox pass 2026-10-08 |
| 599 | `.stamity/runs/2026-10-07_release-1-12-0/record.md` | fix-in-session | fixed in a88c89c2 (runs 42 and 43 archived into evidence-archive-2026-10-08, their hygiene exceptions retired); inbox pass 2026-10-08 |
| 600 | `.stamity/runs/2026-10-07_release-1-12-0/record.md` | cut | cut: alert 26 still names no patched version, so no action exists yet; braces sits in the docs site's build lockfile, not in the published package; inbox pass 2026-10-08 |
| 601 | `2026-10-07_release-1-12-0/build/21` | fix-in-session | fixed in 4dcedb41 and 60722bef (a PASS run of record beside a recorded exception now refuses); inbox pass 2026-10-08 |
| 389 | `docs/plans/016-fork-distribution-01.md` | fix-in-session | fixed in e03a48d1 (the vitest learning names list --json and --outputFile); inbox pass 2026-10-08 |
