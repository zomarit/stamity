# Retained evidence archives

`scripts/evidence-archive.py` uses Python 3.9+ and Git, with no Python packages.
It creates deterministic `.tar.gz` archives, verifies their contents, and restores
original repository paths into a new directory. It never downloads, uploads,
commits, or deletes source evidence.

## Pack historical evidence from Git

Use a full commit SHA and literal file/directory prefixes. The tool reads Git
objects, so dirty files, untracked output and local replacement refs cannot alter
the captured evidence. Repeat `--path` to select multiple prefixes.

```sh
python3 scripts/evidence-archive.py pack \
  --repo . --ref FULL_COMMIT_SHA --path evals/runs/CLOSED_RUN \
  --repository OWNER/REPOSITORY \
  --output /tmp/closed-run.tar.gz --manifest /tmp/ARCHIVE.json \
  --url https://github.com/OWNER/REPOSITORY/releases/download/ARCHIVE_TAG/closed-run.tar.gz
```

Output files must not already exist. Omit `--url` during local preparation; it is
then `null` until a verified storage location is assigned. Keep the completed
`ARCHIVE.json` in Git. Upload the archive to the same public/private repository's
GitHub Release, download it into a separate location, verify, and restore it before
considering removal of the original evidence. This tool does not establish that a
run is closed or that its consumers have migrated.

## Pack future ignored output

New raw evidence should remain in a designated ignored directory. Add
`--working-tree` to capture its current regular files, including ignored and
untracked files. `--ref` still identifies the candidate commit measured by the
run; it does **not** claim those raw output bytes were committed.

```sh
python3 scripts/evidence-archive.py pack \
  --repo . --ref FULL_CANDIDATE_COMMIT_SHA \
  --path .stamity/_scratch/evidence/CLOSED_RUN --working-tree \
  --repository OWNER/REPOSITORY \
  --output /tmp/closed-run.tar.gz --manifest /tmp/ARCHIVE.json
```

Stop writers first. The tool inventories files, hashes stable reads, checks the
bytes again while packing, then compares the final inventory. Changes, additions
or removals fail the capture and remove partial output. Links, nonregular files,
Git metadata and dependency directories (`node_modules`, `.venv`, `venv`,
`__pycache__`) are rejected. Select evidence separately from installations.
Archive output and descriptor paths must be outside the selected input tree.

## Verify and restore

Obtain the descriptor from a trusted repository revision: a checksum proves
integrity against that descriptor, and does not authenticate a replacement
archive and descriptor supplied together by an untrusted party.

```sh
python3 scripts/evidence-archive.py verify \
  --archive /tmp/downloaded/closed-run.tar.gz --manifest PATH/ARCHIVE.json
python3 scripts/evidence-archive.py restore \
  --archive /tmp/downloaded/closed-run.tar.gz --manifest PATH/ARCHIVE.json \
  --destination /tmp/restored-closed-run
```

The destination must be new and its parent must exist. Restore verifies the whole
archive before creating it, then checks every file again while writing. The hash
pass creates a private temporary snapshot; all payload reads consume those same
bytes. Verification needs temporary disk space equal to the compressed archive. File
identity, size and change timestamps must remain stable across all reads; a
concurrent rewrite or replacement fails verification or restore. Existing
files cannot be overwritten; a failed restore removes its partial destination.
Executable bits are retained on systems that support POSIX permissions.

Verification checks the outer hash and size, provenance, counts, paths, modes,
per-file hashes and exact member set. It rejects traversal, links, portable-path
collisions, unknown/duplicate entries, oversized metadata, and hidden trailing
content. Default budgets are 250,000 files and 10 GiB of payload; explicit
`--max-files` / `--max-payload-bytes` options apply to all commands. The embedded
manifest has a fixed 64 MiB cap. Paths with control characters, backslashes,
Windows-reserved names, or trailing dots/spaces are rejected rather than renamed.

## Format version 1

The compact external `ARCHIVE.json` has exactly these fields:

```json
{
  "schemaVersion": 1,
  "format": "tar.gz",
  "source": {
    "repository": "OWNER/REPOSITORY",
    "commit": "FULL_COMMIT_SHA",
    "capture": "git",
    "paths": ["evals/runs/CLOSED_RUN"]
  },
  "archive": {
    "file": "closed-run.tar.gz",
    "sha256": "SHA256_OF_COMPRESSED_ARCHIVE",
    "bytes": 123,
    "url": "https://github.com/OWNER/REPOSITORY/releases/download/ARCHIVE_TAG/closed-run.tar.gz"
  },
  "files": 1,
  "payloadBytes": 42
}
```

`source.capture` is `git` or `working-tree`. The first tar member is
`MANIFEST.json`: `{schemaVersion: 1, source: <same source>, files: [...]}`. Each
file row contains `path`, `sha256`, `bytes` and Git-style `mode` (`100644` or
`100755`). Payload members are named `files/<original-repository-relative-path>`.
Names are sorted; timestamps and ownership are normalized. The original content
and executable status are preserved. Compression is reproducible with the same
Python/zlib implementation; the archive checksum remains the verification source
of truth across toolchain versions.
