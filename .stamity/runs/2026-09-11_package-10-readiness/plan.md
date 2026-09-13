# Package 10 release checkpoint

Release candidate `a81fa5a88ed5eb525fbdffa6e1f0d23f7401fbca` on
`feat/package-10-finish-implementation`, [PR #34](https://github.com/zomarit/stamity/pull/34).
Version 1.6.0 remains published until the governed release sequence completes; this
checkpoint preserves the older preparation snapshots and records the proof at release.

Scope of the continuation: the reviewed Claude CLI evaluation route with byte-bound capture,
seven reviewed reader corrections, ten runs (15–24) at unchanged thresholds, independent
adjudication of every failing row of the complete runs, four reviewed corpus repairs with the
sealed Briefs moved in the same diff, the maintainer's decisions to move the set to SET-v6 with
rubric v7 and to fix and rerun after runs 22 and 23, and fresh platform rehearsals on every
candidate. Client, CLI, public/private APM, customization and upstream-update contracts remain
binding. Packages 11–12 and unrelated cleanup were not started.

Contract census and ownership: the reader and the case Briefs share the judge-input boundary;
the corpus, the sealed Briefs, the case-index Source cells, the emitted client copies, the
emission goldens and the always-on budget table share the corpus-change contract (SET-v6 hard
trigger 1); the private driver's pins share the set-file, rubric and instrument hashes. One
writer owned each artifact class (reader and rule; corpus and cases; run records and
orchestration), with separate independent review by execution and, for prose and rules, on
merits.

Proof at release: run 24 passes every SET-v6 threshold and floor with every sample admitted;
all mandatory gates and platform rehearsals are green on the candidate; the nine human-only QA
observations are UNPERFORMED and accepted under the maintainer's conditional approval. The
[handoff](handoff.md) records evidence and the sequence; the [QA form](qa.md) records the
sign-off; [verification](verification.md) records the receipts.
