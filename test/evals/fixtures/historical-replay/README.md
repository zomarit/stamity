# Historical replay fixtures

These fixtures keep two existing regressions runnable without downloading historical
evidence archives. `PROVENANCE.json` records the public source commit, original paths
and SHA256 hashes. Every copied output and the run 13 summary retain their exact bytes.

Run 24 contains the original records and outputs for the nine adjudicated cases: 27
admitted judges, one rejected judge attempt and the 27 scenarios those judges read.
Its `calls.json` selects those 55 records from the original 476-record array without
changing any record. It is a replay fixture, not the complete evidence of run 24.
The test still compares all 27 verdicts and every binding/advisory row, and requires
the rejected attempt to refuse for its recorded reason.

The full run remains recoverable through its archive pointer under `evals/runs/`.
See `evals/EVIDENCE-STORAGE.md` for the storage and recovery contract.
