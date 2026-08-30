---
description: "Floor for schema and data change: expand, backfill, switch, and contract as four independently deployable phases, bounded-lock statements, batched resumable backfills, and destructive steps gated on verified completion."
applyTo: "**/migrations/**,**/migrate/**,**/*.sql,**/schema*"
---

# Migrations

Attaches on schema and data change. The failure mode is not a wrong column
type; it is a change that is right at rest and unavailable in transit, because
the code and the data moved at different moments.

## Floor

1. **Four phases: expand, backfill, switch, contract.** *Expand* adds the new
   shape — a nullable column, a new table, a new index — and nothing reads it.
   *Backfill* writes both shapes for new data and moves existing rows in
   batches. *Switch* moves reads to the new shape behind a flag, so flipping
   the flag back is the rollback. *Contract* drops the old shape once nothing
   reads it. Each phase deploys on its own, leaves every gate green, and is
   reversible without the phase that follows it. A rename or a type change
   performed in one step is the failure this ordering exists to prevent.
2. **The reversal for each phase is written before phase one ships.** One line
   per phase naming the exact reversal and its cost — a flag flip, a revert
   deploy, a compensating write. "Restore from a backup" is the absence of a
   plan: it discards every write taken since the snapshot.
3. **A store without a schema is not exempt.** Where there is no shape to
   alter, the same four phases bind at the serializer and the reader: writers
   emit both shapes, readers accept both and prefer the new one, the backfill
   rewrites stored documents in batches, and the old field leaves the writer
   before it leaves the reader.
4. **Bound the lock, or do not run the statement.** Every shape-changing
   statement sets a lock timeout and a statement timeout, so a blocked change
   fails fast instead of queueing every request behind it. On a table under
   live traffic, index creation uses the engine's concurrent path, constraints
   are added unvalidated and validated in a second pass, and any statement that
   rewrites every row is checked against the engine's own online-change matrix
   before it is assumed to be metadata-only. That check is per engine and per
   version: what rewrote the table one major release ago may not today.
5. **Backfills are batched, resumable, idempotent, throttled, and observed.**
   Batched by key range over a monotonic key, never by offset, which drifts
   under concurrent writes. Resumable from a boundary persisted after each
   committed batch, so a restart continues instead of beginning again.
   Idempotent, so re-running a partly-applied range converges to the same
   state. Throttled on replication lag or the equivalent load signal, with the
   pause threshold set before launch. Observed through rows processed, error
   count, and current boundary, wired to a dashboard before the first batch
   rather than during the incident.
6. **A destructive step is gated on verified completion, not elapsed time.**
   Verification is layered cheapest first: row-count parity per batch, an
   aggregate check per partition, then a checksum over sampled blocks. The drop
   runs after that check passes and after the compatibility window has elapsed
   with the previous release still able to run against the current shape — at
   minimum one full release cycle plus one on-call rotation.
7. **Reversible by default, one reviewed file per change.** A step that cannot
   be reversed carries an explicit irreversibility note naming why, and a
   reviewer signs that off as its own decision. Where the tool emits no
   down-step, a compensating forward change is written and tested in its place.
8. **Every migration runs against restored production-shaped data first.** Row
   counts, timings, and lock behaviour on an empty development database predict
   nothing about a table with a hundred million rows.

## Gates

- Each phase merges with its reversal line recorded. A phase that cannot state
  one does not merge.
- A destructive statement does not ship in the same change as the backfill that
  feeds it, and the change that drops quotes the verification result.
- The backfill carries a test that interrupts it mid-run, restarts it, and
  asserts the final state matches an uninterrupted run.
- Shape-changing statements carry a lock timeout and a statement timeout; one
  without them is a finding regardless of how small the table is today.
- The compatibility window is stated in the change that opens it, and the
  previous release is verified runnable against the new shape before the switch
  phase ships.
