#!/usr/bin/env python3
"""Pack pinned Git evidence, verify every byte, and restore into a new directory."""

import argparse
import contextlib
import gzip
import hashlib
import io
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys
import tarfile
import tempfile
import unicodedata

CHUNK = 1024 * 1024
MANIFEST_LIMIT = 64 * CHUNK
DEFAULT_FILES = 250_000
DEFAULT_PAYLOAD = 10 * 1024**3
MODES = {"100644": 0o644, "100755": 0o755}


class ArchiveError(Exception):
    """Invalid input or failed integrity check; no payload is logged."""


def require(condition, message):
    if not condition:
        raise ArchiveError(message)


def keys(value, expected, label):
    require(isinstance(value, dict) and set(value) == set(expected),
            f"Invalid {label} fields")


def integer(value, maximum, label, minimum=0):
    require(type(value) is int and minimum <= value <= maximum, f"Invalid {label}")


def safe_path(value):
    require(isinstance(value, str) and 0 < len(value.encode("utf-8")) <= 4096,
            "Invalid path length")
    require(not any(unicodedata.category(c).startswith("C") for c in value),
            "Control characters in path")
    require(not any(c in value for c in '\\:<>"|?*'), "Nonportable path")
    parts = value.split("/")
    for part in parts:
        require(part not in ("", ".", "..") and not part.endswith((" ", ".")),
                "Unsafe path segment")
        require(part.casefold() != ".git", "Git metadata is not evidence")
        require(not re.fullmatch(r"(?i)(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?", part),
                "Reserved path segment")
    return value


def source_valid(source):
    keys(source, ("repository", "commit", "paths", "capture"), "source")
    require(source["capture"] in ("git", "working-tree"), "Invalid source capture")
    require(isinstance(source["repository"], str) and
            re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", source["repository"]),
            "Expected repository owner/name")
    require(isinstance(source["commit"], str) and
            re.fullmatch(r"[0-9a-f]{40}|[0-9a-f]{64}", source["commit"]),
            "Expected full commit SHA")
    paths = source["paths"]
    require(isinstance(paths, list) and paths, "Missing source paths")
    for path in paths:
        safe_path(path)
    require(paths == sorted(set(paths)), "Source paths must be sorted and unique")


def selected(path, prefixes):
    return any(path == prefix or path.startswith(prefix + "/") for prefix in prefixes)


def no_duplicate_keys(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, "Duplicate JSON key")
        result[key] = value
    return result


def decode_json(data):
    return json.loads(data, object_pairs_hook=no_duplicate_keys)


def json_bytes(value):
    return (json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True) + "\n").encode()


def digest_stream(stream, size=None, output=None):
    digest = hashlib.sha256()
    total = 0
    while size is None or total < size:
        block = stream.read(CHUNK if size is None else min(CHUNK, size - total))
        if not block:
            break
        digest.update(block)
        total += len(block)
        if output is not None:
            output.write(block)
    require(size is None or total == size, "Truncated payload")
    return digest.hexdigest(), total


def git(repo, *args):
    result = subprocess.run(["git", "--no-replace-objects", "-C", str(repo), *args], capture_output=True, timeout=120)
    require(result.returncode == 0, "Git object read failed")
    return result.stdout


@contextlib.contextmanager
def blobs(repo):
    # A single batch process avoids launching Git for every file. No shell or filters.
    process = subprocess.Popen(["git", "--no-replace-objects", "-C", str(repo), "cat-file", "--batch"],
                               stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                               stderr=subprocess.DEVNULL)
    try:
        yield process
        process.stdin.close()
        require(process.wait(timeout=120) == 0, "Git batch read failed")
    finally:
        if process.poll() is None:
            process.kill()
            process.wait()
        process.stdout.close()
        if not process.stdin.closed:
            process.stdin.close()


def blob_start(process, entry):
    process.stdin.write((entry["oid"] + "\n").encode("ascii"))
    process.stdin.flush()
    header = process.stdout.readline(256).decode("ascii").strip().split()
    require(header == [entry["oid"], "blob", str(entry["bytes"])], "Unexpected Git object")


def blob_end(process):
    require(process.stdout.read(1) == b"\n", "Invalid Git batch delimiter")


def fingerprint(info):
    return (info.st_dev, info.st_ino, info.st_mode, info.st_size, info.st_mtime_ns, info.st_ctime_ns)


def regular_info(path):
    info = path.lstat()
    require(not stat.S_ISLNK(info.st_mode) and
            not (getattr(info, "st_file_attributes", 0) & getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0)),
            "Working tree contains a link")
    return info


def working_entries(repo, prefixes):
    root = Path(repo).resolve(strict=True)
    found = {}
    forbidden = {"node_modules", ".venv", "venv", "__pycache__", ".git"}

    def visit(path):
        relative = path.relative_to(root).as_posix()
        safe_path(relative)
        require(not any(part.casefold() in forbidden for part in relative.split("/")),
                "Working-tree capture includes dependency or runtime directories")
        info = regular_info(path)
        if stat.S_ISDIR(info.st_mode):
            for child in sorted(path.iterdir()):
                visit(child)
        else:
            require(stat.S_ISREG(info.st_mode), "Working tree contains a nonregular file")
            found[relative] = {"path": relative, "bytes": info.st_size,
                               "mode": "100755" if info.st_mode & 0o111 else "100644",
                               "state": fingerprint(info)}

    for prefix in prefixes:
        current = root
        for part in prefix.split("/"):
            current = current / part
            regular_info(current)
        visit(current)
    return [found[key] for key in sorted(found)]


@contextlib.contextmanager
def entry_reader(args, entry, process):
    if not args.working_tree:
        blob_start(process, entry)
        yield process.stdout
        blob_end(process)
        return
    root = Path(args.repo).resolve(strict=True)
    path = root
    for part in entry["path"].split("/"):
        path = path / part
        regular_info(path)
    descriptor = os.open(path, os.O_RDONLY | getattr(os, "O_BINARY", 0) | getattr(os, "O_NOFOLLOW", 0))
    with os.fdopen(descriptor, "rb") as stream:
        require(fingerprint(os.fstat(stream.fileno())) == entry["state"],
                "Evidence changed before reading")
        yield stream
        require(fingerprint(os.fstat(stream.fileno())) == entry["state"] and
                fingerprint(regular_info(path)) == entry["state"], "Evidence changed while reading")


class HashingReader:
    def __init__(self, raw):
        self.raw = raw
        self.digest = hashlib.sha256()

    def read(self, size=-1):
        block = self.raw.read(size)
        self.digest.update(block)
        return block


def file_rows_valid(rows, source, count, payload):
    require(isinstance(rows, list) and len(rows) == count, "File count mismatch")
    seen = set()
    names = []
    total = 0
    for row in rows:
        keys(row, ("path", "sha256", "bytes", "mode"), "file")
        path = safe_path(row["path"])
        require(selected(path, source["paths"]), "File outside declared source paths")
        identity = unicodedata.normalize("NFC", path).casefold()
        require(identity not in seen, "Duplicate or colliding path")
        seen.add(identity)
        names.append(path)
        integer(row["bytes"], payload, "file bytes")
        require(isinstance(row["mode"], str) and row["mode"] in MODES, "Invalid file mode")
        require(isinstance(row["sha256"], str) and re.fullmatch(r"[0-9a-f]{64}", row["sha256"]),
                "Invalid file checksum")
        total += row["bytes"]
    require(names == sorted(names), "Files must be sorted")
    require(total == payload, "Payload bytes mismatch")
    for path in seen:
        parts = path.split("/")
        require(not any("/".join(parts[:i]) in seen for i in range(1, len(parts))),
                "File/directory collision")
    for prefix in source["paths"]:
        require(any(selected(path, [prefix]) for path in names), "Source path has no files")


def tar_info(name, size, mode=0o644):
    info = tarfile.TarInfo(name)
    info.size = size
    info.mode = mode
    info.mtime = 0
    return info


def pack(args):
    source = {"repository": args.repository, "commit": args.ref,
              "paths": sorted(set(args.path)),
              "capture": "working-tree" if args.working_tree else "git"}
    source_valid(source)
    require(git(args.repo, "cat-file", "-t", args.ref).strip() == b"commit",
            "Source SHA must identify a commit")
    if args.working_tree:
        entries = working_entries(args.repo, source["paths"])
    else:
        entries = []
        # --full-tree, no Git pathspecs: selection has literal prefix semantics.
        for record in git(args.repo, "ls-tree", "-rlz", "--full-tree", args.ref).split(b"\0"):
            if not record:
                continue
            metadata, raw_path = record.split(b"\t", 1)
            path = raw_path.decode("utf-8")
            if not selected(path, source["paths"]):
                continue
            safe_path(path)
            mode, kind, oid, size = metadata.decode("ascii").split()
            require(kind == "blob" and mode in MODES, "Source contains a symlink or nonregular file")
            entries.append({"path": path, "bytes": int(size), "mode": mode, "oid": oid})
        entries.sort(key=lambda row: row["path"])
    require(entries, "No files selected")
    payload = sum(row["bytes"] for row in entries)
    integer(len(entries), args.max_files, "file count", 1)
    integer(payload, args.max_payload_bytes, "payload bytes")
    rows = []
    with contextlib.nullcontext() if args.working_tree else blobs(args.repo) as process:
        for entry in entries:
            with entry_reader(args, entry, process) as stream:
                digest, _ = digest_stream(stream, entry["bytes"])
            rows.append({key: entry[key] for key in ("path", "bytes", "mode")} | {"sha256": digest})
    file_rows_valid(rows, source, len(rows), payload)
    embedded = json_bytes({"schemaVersion": 1, "source": source, "files": rows})
    require(len(embedded) <= MANIFEST_LIMIT, "Embedded manifest exceeds 64 MiB")
    output = Path(args.output)
    manifest = Path(args.manifest)
    require(output.resolve() != manifest.resolve(), "Archive and manifest paths must differ")
    require(not os.path.lexists(output) and not os.path.lexists(manifest), "Output already exists")
    created = []
    try:
        with output.open("xb") as raw:
            created.append(output)
            with gzip.GzipFile(filename="", mode="wb", fileobj=raw, mtime=0) as compressed:
                with tarfile.open(fileobj=compressed, mode="w|", format=tarfile.PAX_FORMAT) as archive:
                    archive.addfile(tar_info("MANIFEST.json", len(embedded)), io.BytesIO(embedded))
                    with contextlib.nullcontext() if args.working_tree else blobs(args.repo) as process:
                        for entry, row in zip(entries, rows):
                            with entry_reader(args, entry, process) as stream:
                                checked = HashingReader(stream)
                                archive.addfile(tar_info("files/" + entry["path"], entry["bytes"],
                                                         MODES[entry["mode"]]), checked)
                                require(checked.digest.hexdigest() == row["sha256"],
                                        "Evidence changed during packing")
        if args.working_tree:
            require(working_entries(args.repo, source["paths"]) == entries,
                    "Evidence file tree changed during packing")
        with output.open("rb") as raw:
            checksum, size = digest_stream(raw)
        external = {"schemaVersion": 1, "format": "tar.gz", "source": source,
                    "archive": {"file": output.name, "sha256": checksum, "bytes": size, "url": args.url},
                    "files": len(rows), "payloadBytes": payload}
        # Validate the descriptor with the same reader used by verify before publishing it.
        descriptor_valid(external, args)
        encoded_descriptor = json_bytes(external)
        require(len(encoded_descriptor) <= CHUNK, "Descriptor exceeds 1 MiB")
        with manifest.open("xb") as raw:
            created.append(manifest)
            raw.write(encoded_descriptor)
    except BaseException:
        for path in reversed(created):
            path.unlink()
        raise
    return {"operation": "pack", "files": len(rows), "payloadBytes": payload,
            "archiveBytes": size, "sha256": checksum}


def descriptor_valid(value, args):
    keys(value, ("schemaVersion", "format", "source", "archive", "files", "payloadBytes"), "descriptor")
    require(type(value["schemaVersion"]) is int and value["schemaVersion"] == 1 and
            value["format"] == "tar.gz", "Unsupported archive format")
    source_valid(value["source"])
    integer(value["files"], args.max_files, "file count", 1)
    integer(value["payloadBytes"], args.max_payload_bytes, "payload bytes")
    archive = value["archive"]
    keys(archive, ("file", "sha256", "bytes", "url"), "archive")
    safe_path(archive["file"])
    require("/" not in archive["file"], "Archive file must be a basename")
    integer(archive["bytes"], args.max_payload_bytes + MANIFEST_LIMIT + value["files"] * 16384,
            "archive bytes", 1)
    require(isinstance(archive["sha256"], str) and re.fullmatch(r"[0-9a-f]{64}", archive["sha256"]),
            "Invalid archive checksum")
    url = archive["url"]
    require(url is None or (isinstance(url, str) and url.startswith("https://") and
                           not any(c.isspace() or unicodedata.category(c).startswith("C") for c in url)),
            "Archive URL must be HTTPS or null")


class LimitedReader:
    def __init__(self, raw, limit):
        self.raw = raw
        self.remaining = limit

    def read(self, size=-1):
        amount = self.remaining + 1 if size < 0 else min(size, self.remaining + 1)
        data = self.raw.read(amount)
        self.remaining -= len(data)
        require(self.remaining >= 0, "Decompressed archive exceeds declared size budget")
        return data


class StrictTarInfo(tarfile.TarInfo):
    def _proc_member(self, archive):
        # tarfile normally consumes extension bodies before yielding a member. Cap
        # these here so an untrusted PAX header cannot request an enormous allocation.
        require(self.type in (tarfile.REGTYPE, tarfile.AREGTYPE, tarfile.XHDTYPE),
                "Archive contains a link or unsupported entry type")
        require(self.size >= 0, "Negative tar member size")
        if self.type == tarfile.XHDTYPE:
            require(self.size <= 16384, "Oversized tar metadata")
            require(not getattr(archive, "_evidence_pax_pending", False), "Nested tar metadata")
            archive._evidence_pax_pending = True
            try:
                return super()._proc_member(archive)
            finally:
                archive._evidence_pax_pending = False
        return super()._proc_member(archive)


def inspect_payload(raw, descriptor, destination=None):
    raw.seek(0)
    budget = descriptor["payloadBytes"] + MANIFEST_LIMIT + descriptor["files"] * 16384 + 20480
    with gzip.GzipFile(fileobj=raw, mode="rb") as compressed:
        with tarfile.open(fileobj=LimitedReader(compressed, budget), mode="r|",
                          tarinfo=StrictTarInfo) as archive:
            first = archive.next()
            require(first is not None and first.name == "MANIFEST.json" and first.isfile() and
                    not first.pax_headers and first.size <= MANIFEST_LIMIT, "Missing or oversized embedded manifest")
            embedded_stream = archive.extractfile(first)
            embedded = decode_json(embedded_stream.read())
            keys(embedded, ("schemaVersion", "source", "files"), "embedded manifest")
            require(type(embedded["schemaVersion"]) is int and embedded["schemaVersion"] == 1 and
                    embedded["source"] == descriptor["source"], "Embedded provenance mismatch")
            rows = embedded["files"]
            file_rows_valid(rows, descriptor["source"], descriptor["files"], descriptor["payloadBytes"])
            expected = {"files/" + row["path"]: row for row in rows}
            seen = set()
            for member in archive:
                if member is first:
                    continue
                require(member.name in expected and member.name not in seen, "Duplicate or unlisted archive entry")
                row = expected[member.name]
                require(member.isfile() and set(member.pax_headers) <= {"path"} and
                        member.size == row["bytes"] and member.mode == MODES[row["mode"]],
                        "Archive entry metadata mismatch")
                stream = archive.extractfile(member)
                if destination is None:
                    checksum, _ = digest_stream(stream, row["bytes"])
                else:
                    target = destination.joinpath(*row["path"].split("/"))
                    target.parent.mkdir(parents=True, exist_ok=True)
                    with target.open("xb") as output:
                        checksum, _ = digest_stream(stream, row["bytes"], output)
                    target.chmod(MODES[row["mode"]])
                require(checksum == row["sha256"], "Payload checksum mismatch")
                seen.add(member.name)
            require(seen == set(expected), "Missing archive entries")
            # Consume through gzip's CRC/trailer. Reject a hidden second tar archive
            # or nonzero trailing data instead of stopping at the first tar EOF.
            while True:
                padding = archive.fileobj.read(CHUNK)
                if not padding:
                    break
                require(not padding.strip(b"\0"), "Unexpected trailing archive content")


def verify_or_restore(args):
    with Path(args.manifest).open("rb") as source:
        encoded = source.read(CHUNK + 1)
    require(len(encoded) <= CHUNK, "Descriptor exceeds 1 MiB")
    descriptor = decode_json(encoded)
    descriptor_valid(descriptor, args)
    destination = Path(args.destination) if args.command == "restore" else None
    if destination is not None:
        require(not os.path.lexists(destination), "Restore destination already exists")
    archive_path = Path(args.archive)
    with archive_path.open("rb") as raw, tempfile.TemporaryFile(mode="w+b") as snapshot:
        initial = os.fstat(raw.fileno())
        require(stat.S_ISREG(initial.st_mode), "Archive must be a regular file")
        require(initial.st_size == descriptor["archive"]["bytes"], "Archive size mismatch")
        archive_state = fingerprint(initial)
        snapshot_state = None

        def unchanged():
            # The open descriptor detects in-place rewrites; the path check also
            # detects rename/replacement. The private snapshot ties every payload
            # read to the bytes hashed even on filesystems with coarse timestamps.
            require(fingerprint(os.fstat(raw.fileno())) == archive_state and
                    fingerprint(archive_path.stat()) == archive_state and
                    (snapshot_state is None or fingerprint(os.fstat(snapshot.fileno())) == snapshot_state),
                    "Archive changed during verification or restore")

        unchanged()
        checksum, size = digest_stream(raw, descriptor["archive"]["bytes"], output=snapshot)
        require(raw.read(1) == b"", "Archive changed: grew during verification")
        snapshot.flush()
        snapshot_state = fingerprint(os.fstat(snapshot.fileno()))
        unchanged()
        require(checksum == descriptor["archive"]["sha256"] and size == descriptor["archive"]["bytes"],
                "Archive checksum mismatch")
        inspect_payload(snapshot, descriptor)
        unchanged()
        if destination is not None:
            # No restore writes before full verification. A new private directory and
            # exclusive files prevent existing content from being overwritten.
            destination.mkdir(mode=0o700)
            try:
                unchanged()
                inspect_payload(snapshot, descriptor, destination)
                unchanged()
            except BaseException:
                shutil.rmtree(destination)
                raise
    return {"operation": args.command, "files": descriptor["files"],
            "payloadBytes": descriptor["payloadBytes"], "sha256": checksum}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    for name in ("pack", "verify", "restore"):
        command = commands.add_parser(name)
        command.add_argument("--manifest", required=True, help="External ARCHIVE.json descriptor")
        command.add_argument("--max-files", type=int, default=DEFAULT_FILES)
        command.add_argument("--max-payload-bytes", type=int, default=DEFAULT_PAYLOAD)
        if name == "pack":
            command.add_argument("--repo", required=True)
            command.add_argument("--ref", required=True, help="Full commit SHA (not a moving branch)")
            command.add_argument("--path", action="append", required=True, help="Literal repository path prefix")
            command.add_argument("--output", required=True)
            command.add_argument("--repository", required=True, help="GitHub owner/repository")
            command.add_argument("--url", default=None)
            command.add_argument("--working-tree", action="store_true",
                                 help="Capture stable untracked/ignored files; ref identifies candidate provenance")
        else:
            command.add_argument("--archive", required=True)
            if name == "restore":
                command.add_argument("--destination", required=True, help="New directory; parent must exist")
    args = parser.parse_args()
    try:
        integer(args.max_files, 1_000_000, "maximum files", 1)
        integer(args.max_payload_bytes, 1024**4, "maximum payload bytes", 1)
        result = pack(args) if args.command == "pack" else verify_or_restore(args)
        print(json.dumps(result, sort_keys=True))
    except (ArchiveError, OSError, ValueError, KeyError, TypeError, tarfile.TarError,
            EOFError, RecursionError, subprocess.SubprocessError) as error:
        # Exception messages from JSON/tar codecs can contain evidence fragments.
        message = str(error) if isinstance(error, ArchiveError) else type(error).__name__
        print(json.dumps({"error": message}), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
