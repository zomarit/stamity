# Package 10 release preparation checkpoint

Current candidate `29894bc4987706a92c295313057ee046f71c52fb` on
`feat/package-10-finish-implementation`, draft [PR #34](https://github.com/zomarit/stamity/pull/34).
Version 1.6.0 remains published; 1.7.0 is prepared and unpublished. This checkpoint preserves
the older preparation snapshots and records the current proof boundary. It is not release
approval.

The continuation's scope: the reviewed Claude CLI evaluation route with byte-bound capture,
seven reviewed reader corrections, three complete full runs (19, 20, 21) at unchanged
thresholds, independent adjudication of every failing row, two reviewed corpus repairs of the
adjudicated product failures with the sealed Briefs moved in the same diff, and fresh platform
rehearsals on the current candidate. Client, CLI, public/private APM, customization and
upstream-update contracts remain binding. Packages 11–12 and unrelated cleanup were not
started.

Contract census and ownership: the reader and the case Briefs share the judge-input boundary;
the corpus, the sealed Briefs, the case-index Source cells, the emitted client copies, the
emission goldens and the always-on budget table share the corpus-change contract (SET-v5 hard
trigger 1); the private driver's pins share the set-file and instrument hashes. One writer owned
each artifact class (reader; corpus and cases; run records and orchestration), with separate
independent review by execution and, for prose, on merits.

Proof boundary after run 21: the corpus is sufficient to produce the required behaviour on the
measured pair about two times in three and not reliably; the strict rule fails on floor and
guardrail clauses in every complete run; no case is systematic in the sense of failing every
sample on an unchanged Brief, except where the judge read a criterion two ways. The reader
needed a correction after every run; the last one is committed and reviewed.

Decision pending with the maintainer:

1. Continue the repair-and-rerun loop (next window opens 16:10Z on 2026-09-12), reader-only or
   with a rubric revision that fixes the citation form.
2. Close 1.7.0 unreleased for now, runs 15–21 as the retained record, and revise the scoring
   rule or sample count in the next set version.
3. Release under an explicit written exception naming the red metrics and cases, as 1.6.0
   shipped on run 10; the conditional approval as given does not cover this.

Until that decision: keep PR34 draft, unmerged and unpublished. The [handoff](handoff.md)
records evidence and the prepared sequence; the [QA form](qa.md) records the conditional
sign-off and the nine unperformed rows; [verification](verification.md) records the current
receipts.
