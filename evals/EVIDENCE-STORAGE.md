# Eval evidence storage

Historical run evidence is retained in GitHub Release assets in `zomarit/stamity`.
Git keeps each run's results, provenance, protocols, summaries and an `ARCHIVE.json`
pointer for any payload moved out of the checkout. Archival changes storage, not
the recorded observation, grade, threshold or verdict.

The [2026-09-15 migration receipt](ARCHIVE-MIGRATION-2026-09-15.json) records
per-run storage reductions and independent checks of each downloaded archive:
file census, Git blob identities, executable modes and successful restoration.
It also records the retained-data comparisons and consumer tests for this migration.

## What stays available in a checkout

- `RESULTS.md`, input/protocol records and archive pointers remain beside the run.
- `summary.json` remains at its original path as a compact view when the full
  original is archived. Compaction removes only `aggregate.rows` and `coverage`,
  which duplicate detailed samples. Every other value remains unchanged, including
  `configurationHash`, `status`, `startedAt` and the complete `advisory` object
  consumed by the manual runner's `previousRun` gate. Metrics, floors, case results,
  calibration, terminal flags and `notDone` also stay. The runtime harness needs
  no reader change and still gates advisory repeats against the same facts.
- The exact regression inputs needed by the automated suite live under
  `test/evals/fixtures/historical-replay/`. Their `PROVENANCE.json` records source
  commit, original paths and SHA256 hashes. Run 24's fixture selects 55 original
  call records: the 27 admitted judges, one rejected attempt, and their 27 scenario
  records. All selected record values and output bytes are unchanged. The fixture
  supports the same 27 verdict checks; it is not a complete run export.
- Versioned sets, rubrics and historical protocols retain their original text.
  Their raw-data references resolve through the archive pointer and the restored
  original paths. For example, SET-v4's `samples.jsonl` recomputations require
  restoring the corresponding runs before using the old analysis procedure.

Runs 25–27 and active release inputs are outside this historical cleanup. No run
is archived until its owner has closed it and its consumers have a verified
recovery path. The initial migration covers selected raw payloads of closed runs
3–24; it keeps their summary views and does not rewrite historical protocols.

## Pointer and archive contract

An `ARCHIVE.json` pointer has `schemaVersion: 1`, `format: "tar.gz"`, and:

| Field | Meaning |
|---|---|
| `source.repository` | `zomarit/stamity`, which also owns the release asset |
| `source.commit` | Full commit SHA identifying the source or measured candidate |
| `source.capture` | `git` for committed payloads; `working-tree` for captured local bytes |
| `source.paths` | Literal repository-relative paths included in this archive |
| `archive.file` | Unique release asset filename |
| `archive.sha256`, `archive.bytes` | SHA256 and compressed size of the complete archive |
| `archive.url` | GitHub Release asset URL; required before dropping tracked payloads |
| `files`, `payloadBytes` | Payload file count and total uncompressed bytes |

The archive contains `MANIFEST.json` and payload members at
`files/<original-repository-relative-path>`. The embedded manifest binds each
payload path, byte size, executable mode and SHA256. Counts exclude the embedded
manifest itself. A downloaded archive must match both the pointer and its exact
embedded inventory before a restored payload is accepted.

For `source.capture: "git"`, the archive is built from the named commit's Git
objects. For `source.capture: "working-tree"`, the commit identifies candidate
context; the raw files may be ignored or untracked and their bytes are identified
by the manifest. The packer checks the selected file census and hashes before and
after capture, refusing an unstable capture. This mode never claims the raw bytes
came from the commit.

## Download, verify and restore

Read the run's pointer to obtain the release tag and exact asset filename. Download
that asset from the named release in `zomarit/stamity` into a temporary directory.
For example, replace the uppercase placeholders with the pointer's actual values:

```sh
mkdir -p /tmp/stamity-evidence-download
gh release download RELEASE_TAG --repo zomarit/stamity --pattern ASSET_FILENAME.tar.gz --dir /tmp/stamity-evidence-download
python3 scripts/evidence-archive.py verify --archive /tmp/stamity-evidence-download/ASSET_FILENAME.tar.gz --manifest evals/runs/RUN_ID/ARCHIVE.json
python3 scripts/evidence-archive.py restore --archive /tmp/stamity-evidence-download/ASSET_FILENAME.tar.gz --manifest evals/runs/RUN_ID/ARCHIVE.json --destination /tmp/stamity-evidence-restored
```

The destination must not exist and its parent must exist. Verification checks
archive identity and every payload member. Restore rejects unsafe paths, duplicate
entries, unsupported links and hash mismatches, and preserves executable modes.
The contributor helper uses Python 3's standard library; no package installation
is required. It is not a product runtime dependency.

Read restored files at `/tmp/stamity-evidence-restored/<original-path>`. Use an
isolated checkout of `source.commit` with the restored payload when an old reader
expects files beside its source. Never restore over an active run or use a new
reader to claim reproduction of an old measurement without checking its version.

## Compact summary views

After the full original `summary.json` has been included in the archive and the
downloaded asset has passed restoration checks, create its compact view with:

```sh
node scripts/evidence-summary.mjs --source /tmp/stamity-evidence-restored/evals/runs/RUN_ID/summary.json --output /tmp/RUN_ID-compact-summary.json --manifest evals/runs/RUN_ID/ARCHIVE.json
```

The helper validates the published pointer and creates a new file. It refuses
overwrites and already compacted input; it does not upload, delete, replace a
tracked summary or independently attest that a remote archive was restored.
The migration installs the verified output at the original `summary.json` path
together with its archive pointer. The compact view adds this explicit notice:

```json
{
  "archiveStorage": {
    "kind": "compact-summary",
    "manifest": "ARCHIVE.json",
    "originalPath": "summary.json"
  }
}
```

Readers needing complete sample grades or coverage use the archived original.
The compactor preserves unfamiliar fields rather than guessing that they are
disposable. New bulky fields require a separate reader census and reviewed change.

## Publishing new evidence

1. Close the run and inventory its consumers. Keep compact summaries needed by
   advisory repeat checks and the records needed for current navigation in Git.
   Include each full original summary in the archive before generating its view.
2. Screen payloads for credentials and unintended local context before upload.
   Report findings without printing sensitive values. Preserve original evidence
   under its intended access boundary; a finding blocks public upload.
3. Pack exact Git objects, or explicitly use `--working-tree` for new local raw
   output. Keep archive and pointer outputs outside the selected payload paths.
   Use a unique asset filename; never replace a published asset with new bytes.
4. Upload to a release in `zomarit/stamity`, then download the asset through GitHub.
   Verify and restore that downloaded copy into a new directory, including exact
   path-set, mode, size and SHA256 checks against the source inventory.
5. Only after recovery passes, commit the populated pointer and removal of the
   expanded payload together. A local pointer with `archive.url: null` is useful
   during preparation but is not a published recovery path.

The shared repository hygiene check rejects newly added raw payloads that belong
in archives and catches declared runtime trees. The producer may still need raw
files locally while scoring or exporting; ignore rules alone do not implement a
run-close archival workflow. Preserve those local files until the release asset
has passed restoration checks. Never treat an ignored evidence file as disposable.

Release assets are retained independently of temporary workflow artifacts and
have no automatic expiry under this policy. This cleanup reduces the current
checkout; earlier Git history still contains its earlier payloads. It does not
rewrite history or revoke access to historical evidence.
