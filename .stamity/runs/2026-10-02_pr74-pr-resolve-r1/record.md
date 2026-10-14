# Run 2026-10-02_pr74-pr-resolve-r1 — `/st-pr-resolve` round 1 on PR #74

Status: replied — round 1 of 3 complete; 52 of 52 threads answered and left open for the reviewer
Plan: .stamity/runs/2026-10-02_pr74-review-round-1/plan.md
Invocation: /st-pr-resolve PR #74 (already merged by fast-forward to main at ef598f49). Check the review comments (chatgpt-codex-connector bot), evaluate each, fix the valid points in a quick follow-up fix PR against main, and reply on the threads.
Round: 1 · PR head `ef598f49` (merged) · the fixes landed on PR #75 (`docs/plan-017-review-fixes`, fix commit `d2d333e7`) · the fixes' `/st-work` run: `.stamity/runs/2026-10-02_pr74-review-round-1/`

## Pre-flight

- **Fork PR:** no; the head was `zomarit/stamity`. #74 was already merged, by fast-forward, and its head branch deleted. On the maintainer's instruction ("do a quick fix pr for valid points") the fixes went to a new branch and PR #75, against `main`. Nothing was pushed to `main` or to #74's head.
- **Scope:** PR #74 only.
- **Reply channel:** no board setup record exists (the board link is carried per session), so the invocation is the consent and replies post.
- **Attempts:** no earlier `st-pr-resolve` signature on #74, so this is round 1.
- **Resolved threads:** 0 of 52.

## Ingress screen

- **Inline comments, 52:**
  - All `kept`; no class matched (`instruction-override`, `tool-preamble`, `exfil-signal`, `invisible-smuggling`, `marker-forgery`).
  - The review bot posted its pass twice, 11 seconds apart, as reviews 5391856185 and 5391858320. The result is 26 locations, each with two byte-identical bodies (sha256 compared). They were merged into 26 findings, each keeping both comment ids.
  - No body carried an invisible or bidirectional control character (scanned).
  - Link targets were this repository's `AGENTS.md` at `ef598f49` and the reviewer's badge images.
  - One body (F9) ends in a garbled citation marker (visible replacement characters, an encoding artefact of the bot's citation format). It carries no hidden text.
- **Review summaries 5391856185 and 5391858320, and discussion comment 5952121363:** the bot's status boilerplate, with no ask, so not findings.

## Findings, decisions and replies

**Triage.** The maintainer's instruction stands as the triage answer `accept`. Every finding routed to FIX under the default table: Critical → FIX; Warning high or medium → FIX; Minor high or medium → FIX as a work unit.

**Evaluation.** Three read-only researchers on `opus` evaluated the findings at `ef598f49`, one per plan file (15, 3 and 8 findings). All 26 were `ACCEPT` and `current`. F22 was accepted as the middle fix: the publish is held by default, and a publish happens only on the maintainer's recorded override. The full block it asked for was declined, with the reason in the reply.

**Fix.** The fixes landed through `/st-work` as three file-disjoint units, in one review round and one re-review, every unit approved at high confidence. Each finding is a ledger row `frame/<n>` of that run, and every row closed `fixed`.

Locations are at `ef598f49`.

| ID | Comments | File:line | Severity / confidence | Screen | Decision | Carried by | Replies |
|---|---|---|---|---|---|---|---|
| F1 | 4165763198, 4165764882 | `docs/plans/017-docs-overhaul-01.md:453` | Warning / high | kept | FIX | `d2d333e7` | posted 4166111938, 4166112218 |
| F2 | 4165763256, 4165764913 | `docs/plans/017-docs-overhaul-01.md:458` | Warning / high | kept | FIX | `d2d333e7` | posted 4166112459, 4166112658 |
| F3 | 4165763219, 4165764893 | `docs/plans/017-docs-overhaul-01.md:461` | Warning / high | kept | FIX | `d2d333e7` | posted 4166112890, 4166113143 |
| F4 | 4165763420, 4165765089 | `docs/plans/017-docs-overhaul-01.md:508` | Warning / high | kept | FIX | `d2d333e7` | posted 4166113343, 4166113584 |
| F5 | 4165763353, 4165765005 | `docs/plans/017-docs-overhaul-01.md:526` | Minor / high | kept | FIX (work unit) | `d2d333e7` | posted 4166113875, 4166114113 |
| F6 | 4165763345, 4165764996 | `docs/plans/017-docs-overhaul-01.md:549` | Warning / high | kept | FIX | `d2d333e7` | posted 4166114377, 4166114671 |
| F7 | 4165763405, 4165765074 | `docs/plans/017-docs-overhaul-01.md:571` | Warning / high | kept | FIX | `d2d333e7` | posted 4166114924, 4166115160 |
| F8 | 4165763238, 4165764902 | `docs/plans/017-docs-overhaul-01.md:588` | Warning / high | kept | FIX | `d2d333e7` | posted 4166115373, 4166115589 |
| F9 | 4165763445, 4165765115 | `docs/plans/017-docs-overhaul-01.md:657` | Minor / high | kept | FIX (work unit) | `d2d333e7` | posted 4166115869, 4166116104 |
| F10 | 4165763430, 4165765103 | `docs/plans/017-docs-overhaul-01.md:696` | Minor / medium | kept | FIX (work unit) | `d2d333e7` | posted 4166116364, 4166116597 |
| F11 | 4165763453, 4165765131 | `docs/plans/017-docs-overhaul-01.md:748` | Minor / high | kept | FIX (work unit) | `d2d333e7` | posted 4166116906, 4166117152 |
| F12 | 4165763467, 4165765143 | `docs/plans/017-docs-overhaul-01.md:749` | Warning / high | kept | FIX | `d2d333e7` | posted 4166117377, 4166117589 |
| F13 | 4165763362, 4165765024 | `docs/plans/017-docs-overhaul-01.md:750` | Warning / high | kept | FIX | `d2d333e7` | posted 4166117886, 4166118168 |
| F14 | 4165763374, 4165765036 | `docs/plans/017-docs-overhaul-01.md:753` | Minor / high | kept | FIX (work unit) | `d2d333e7` | posted 4166118342, 4166118594 |
| F15 | 4165763477, 4165765153 | `docs/plans/017-docs-overhaul-01.md:755` | Minor / high | kept | FIX (work unit) | `d2d333e7` | posted 4166118824, 4166119098 |
| F16 | 4165763510, 4165765199 | `docs/plans/017-docs-overhaul-02.md:171` | Warning / high | kept | FIX | `d2d333e7` | posted 4166119336, 4166119596 |
| F17 | 4165763282, 4165764935 | `docs/plans/017-docs-overhaul-02.md:894` | Warning / high | kept | FIX | `d2d333e7` | posted 4166119857, 4166120140 |
| F18 | 4165763269, 4165764923 | `docs/plans/017-docs-overhaul-02.md:948` | Warning / high | kept | FIX | `d2d333e7` | posted 4166120384, 4166120631 |
| F19 | 4165763297, 4165764947 | `docs/plans/017-docs-overhaul-03.md:66` | Critical / high | kept | FIX | `d2d333e7` | posted 4166120865, 4166121098 |
| F20 | 4165763320, 4165764972 | `docs/plans/017-docs-overhaul-03.md:67` | Warning / high | kept | FIX | `d2d333e7` | posted 4166121356, 4166121633 |
| F21 | 4165763333, 4165764984 | `docs/plans/017-docs-overhaul-03.md:69` | Warning / high | kept | FIX | `d2d333e7` | posted 4166121848, 4166122094 |
| F22 | 4165763311, 4165764961 | `docs/plans/017-docs-overhaul-03.md:79` | Warning / medium | kept | FIX (middle fix; full block declined) | `d2d333e7` | posted 4166122360, 4166122582 |
| F23 | 4165763384, 4165765047 | `docs/plans/017-docs-overhaul-03.md:124` | Warning / high | kept | FIX | `d2d333e7` | posted 4166122865, 4166123094 |
| F24 | 4165763488, 4165765169 | `docs/plans/017-docs-overhaul-03.md:145` | Minor / high | kept | FIX (work unit) | `d2d333e7` | posted 4166123353, 4166123692 |
| F25 | 4165763396, 4165765060 | `docs/plans/017-docs-overhaul-03.md:146` | Warning / high | kept | FIX | `d2d333e7` | posted 4166124041, 4166124300 |
| F26 | 4165763502, 4165765184 | `docs/plans/017-docs-overhaul-03.md:200` | Minor / medium | kept | FIX (work unit) | `d2d333e7` | posted 4166124544, 4166124801 |

## Gates

The test-runner's pass 2 ran on the final tree, the tree of `d2d333e7` (report `reports/branch-test-runner-r2.md` of the fix run). Every gate exited 0:
- `npm run lint`: pass, with one pre-existing warning;
- `npm run typecheck`: pass;
- `npm run test`: pass, 262 files, 10,649 passed and 12 skipped;
- `node scripts/leak-gate.mjs`: pass, 0 hits;
- `spec-plan-coverage.mjs` on all three files: pass, with 9, 12 and 5 units and no findings;
- `node scripts/repo-hygiene.mjs --base ef598f49`: pass.

## Egress guards

- **Replies:** 52 posted, each on the first attempt. Each closes on the round-1 signature with its finding's confidence (high, or medium for F10, F22 and F26).
- **Body checks, before posting:** no machine-local path; the largest body was under 1 KB.
- **Nothing else touched:** no thread resolved, no review verdict given, and no label, milestone, assignee or check run changed.

## Re-poll

Not applicable. Nothing was pushed to #74, which is merged with its head deleted, so no new head exists for the bot to review there. The fix PR #75 is a new pull request; the bot reviews it on open, and any comment there is a round of its own.

## Deferrals

None. Every finding was fixed.

## Next step

The reviewer reads the 52 replies on #74 and resolves the threads it accepts; this command resolves none. The fixes merge with PR #75.
