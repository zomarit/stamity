# The records branch

This branch holds the repository's working records at the paths they have on `main`: run records
and ledgers (`.stamity/runs/`), the deferral inbox (`.stamity/inbox.md`), handoffs
(`.stamity/handoffs/`), QA evidence (`.stamity/evidence/`), plans (`docs/plans/`), eval runs
(`evals/runs/`), measurement snapshots (`evals/measurements/`, `evals/reach/`) and two eval notes
(`evals/EVIDENCE-STORAGE.md`, `evals/ARCHIVE-MIGRATION-2026-09-15.json`).

It shares no history with `main` and is never merged into it, so forks, which merge release tags,
and installs, which take `main`'s tree, never receive it.

## Working with it

From a checkout of `main`:

- `node scripts/records.mjs setup` hides the record paths from `main` through `.git/info/exclude`
  and restores the records into the checkout.
- `node scripts/records.mjs commit -m "<message>"` publishes the records on disk: it builds a
  commit on this branch through a separate index, gates that exact commit (the leak gate, the
  hygiene check and `npm run test:records`), then pushes it.
- A run whose `record.md` still reads `Status: in progress` in its first 15 lines is left out of a
  publish, and its copy here stays as it is, until the run closes.

Pushes are never forced, and the branch cannot be deleted. When `commit` refuses because the
branch moved, run `node scripts/records.mjs restore`, then `commit` again. `restore` writes what
changed only on the branch, keeps what you changed and have not published, and refuses, writing
nothing, when a record changed on both sides.
