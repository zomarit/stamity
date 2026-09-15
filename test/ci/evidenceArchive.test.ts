import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const python = process.platform === "win32" ? "python" : "python3";
const script = resolve("scripts/evidence-archive.py");
const work = mkdtempSync(join(tmpdir(), "stamity-evidence-archive-"));
afterAll(() => rmSync(work, { recursive: true, force: true }));

function command(executable: string, args: string[], cwd?: string) {
  return spawnSync(executable, args, {
    cwd, encoding: "utf8", timeout: 30_000, env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
  });
}
function git(repo: string, ...args: string[]): string {
  const result = command("git", ["-C", repo, ...args]);
  expect(result.status, result.stderr).toBe(0);
  return result.stdout.trim();
}
function run(...args: string[]) {
  return command(python, [script, ...args]);
}
function ok(result: ReturnType<typeof run>): void {
  expect(result.status, result.stderr).toBe(0);
}
function fixture() {
  const dir = mkdtempSync(join(work, "case-"));
  const repo = join(dir, "repo");
  mkdirSync(join(repo, "runs", "closed", "nested"), { recursive: true });
  writeFileSync(join(repo, "runs", "closed", "input.txt"), "Original prompt.\n");
  writeFileSync(join(repo, "runs", "closed", "nested", "output.bin"), Buffer.from([0, 255, 4, 128, 10]));
  writeFileSync(join(repo, "runs", "closed", "replay.sh"), "#!/bin/sh\nprintf 'retained evidence\\n'\n");
  chmodSync(join(repo, "runs", "closed", "replay.sh"), 0o755);
  git(repo, "init", "-q");
  git(repo, "config", "user.email", "archive-test@example.invalid");
  git(repo, "config", "user.name", "Archive test");
  git(repo, "config", "core.autocrlf", "false");
  git(repo, "add", ".");
  git(repo, "update-index", "--chmod=+x", "runs/closed/replay.sh");
  git(repo, "commit", "-qm", "Evidence fixture");
  const sha = git(repo, "rev-parse", "HEAD");
  const archive = join(dir, "evidence.tar.gz");
  const manifest = join(dir, "ARCHIVE.json");
  function pack(output = archive, descriptor = manifest, path = "runs/closed") {
    return run("pack", "--repo", repo, "--ref", sha, "--path", path,
      "--repository", "example/evidence", "--output", output, "--manifest", descriptor);
  }
  function verify() { return run("verify", "--archive", archive, "--manifest", manifest); }
  function restore(destination = join(dir, "restored")) {
    return run("restore", "--archive", archive, "--manifest", manifest, "--destination", destination);
  }
  return { dir, repo, sha, archive, manifest, pack, verify, restore };
}

// Forge archives using the real stdlib tar writer and update the outer checksum;
// rejection must therefore come from the inner evidence checks, not a stale hash.
const FORGE = `
import gzip, hashlib, io, json, pathlib, sys, tarfile
archive, descriptor, attack = map(str, sys.argv[1:])
with tarfile.open(archive, 'r:gz') as source:
    rows = [(m, source.extractfile(m).read()) for m in source]
manifest = json.loads(rows[0][1])
if attack == 'duplicate': rows.append(rows[1])
elif attack == 'missing': rows.pop()
elif attack == 'unlisted':
    extra = tarfile.TarInfo('files/runs/closed/extra.txt'); extra.size = 4
    rows.append((extra, b'extra'[:4]))
elif attack == 'traversal':
    manifest['files'][0]['path'] = '../../escaped.txt'
    rows[1][0].name = 'files/../../escaped.txt'
elif attack == 'absolute':
    manifest['files'][0]['path'] = '/escaped.txt'
    rows[1][0].name = '/escaped.txt'
elif attack == 'backslash':
    manifest['files'][0]['path'] = 'runs/closed/..\\\\escaped.txt'
    rows[1][0].name = 'files/' + manifest['files'][0]['path']
elif attack == 'payload': rows[1] = (rows[1][0], b'X' * len(rows[1][1]))
elif attack == 'mode': rows[1][0].mode = 0o777
elif attack == 'symlink':
    rows[1][0].type = tarfile.SYMTYPE; rows[1][0].linkname = '../../escaped.txt'; rows[1][0].size = 0
    rows[1] = (rows[1][0], b'')
elif attack == 'source': manifest['source']['commit'] = 'f' * 40
elif attack == 'counts': manifest['files'].pop()
elif attack == 'collision':
    parent, name = manifest['files'][0]['path'].rsplit('/', 1)
    manifest['files'][1]['path'] = parent + '/' + name.upper()
    rows[2][0].name = 'files/' + manifest['files'][1]['path']
elif attack == 'file-directory':
    manifest['files'][1]['path'] = manifest['files'][0]['path'] + '/child.txt'
    rows[2][0].name = 'files/' + manifest['files'][1]['path']
elif attack == 'pax-bomb': rows[1][0].pax_headers = {'comment': 'X' * 20000}
encoded = json.dumps(manifest, sort_keys=True).encode()
rows[0] = (rows[0][0], encoded); rows[0][0].size = len(encoded)
with tarfile.open(archive, 'w:gz', format=tarfile.PAX_FORMAT) as output:
    for member, data in rows: output.addfile(member, io.BytesIO(data))
if attack == 'trailing':
    with open(archive, 'ab') as output: output.write(gzip.compress(b'hidden content'))
if attack == 'padding-bomb':
    with open(archive, 'ab') as output: output.write(gzip.compress(bytes(70 * 1024 * 1024)))
raw = pathlib.Path(archive).read_bytes()
external = json.loads(pathlib.Path(descriptor).read_text())
external['archive']['sha256'] = hashlib.sha256(raw).hexdigest()
external['archive']['bytes'] = len(raw)
pathlib.Path(descriptor).write_text(json.dumps(external))
`;

function forge(f: ReturnType<typeof fixture>, attack: string): void {
  const result = command(python, ["-c", FORGE, f.archive, f.manifest, attack]);
  expect(result.status, result.stderr).toBe(0);
}

describe("retained evidence archives", () => {
  it("packs pinned Git bytes deterministically despite dirty and untracked working files", () => {
    const f = fixture();
    ok(f.pack());
    writeFileSync(join(f.repo, "runs/closed/input.txt"), "Uncommitted private content.\n");
    writeFileSync(join(f.repo, "runs/closed/untracked.log"), "Untracked private content.\n");
    const second = join(f.dir, "second.tar.gz");
    ok(f.pack(second, join(f.dir, "SECOND.json")));
    expect(readFileSync(second)).toEqual(readFileSync(f.archive));
    ok(f.verify());
    const restored = f.restore();
    ok(restored);
    expect(restored.stdout).not.toContain("Original prompt");
    expect(readFileSync(join(f.dir, "restored/runs/closed/input.txt"), "utf8")).toBe("Original prompt.\n");
    expect(readFileSync(join(f.dir, "restored/runs/closed/nested/output.bin"))).toEqual(Buffer.from([0, 255, 4, 128, 10]));
    expect(existsSync(join(f.dir, "restored/runs/closed/untracked.log"))).toBe(false);
    if (process.platform !== "win32") {
      expect(statSync(join(f.dir, "restored/runs/closed/replay.sh")).mode & 0o777).toBe(0o755);
    }
    const descriptor = JSON.parse(readFileSync(f.manifest, "utf8")) as {
      source: { commit: string }; files: number; archive: { sha256: string };
    };
    expect(descriptor.source.commit).toBe(f.sha);
    expect(descriptor.files).toBe(3);
    expect(descriptor.archive.sha256).toBe(createHash("sha256").update(readFileSync(f.archive)).digest("hex"));
  });

  it("preserves spaces, Unicode and paths requiring extended tar headers", () => {
    const f = fixture();
    const folder = join(f.repo, "runs/closed", ("long folder ".repeat(10) + "data"));
    mkdirSync(folder);
    writeFileSync(join(folder, "résumé.txt"), "Unicode evidence.\n");
    git(f.repo, "add", ".");
    git(f.repo, "commit", "-qm", "Long path fixture");
    ok(run("pack", "--repo", f.repo, "--ref", git(f.repo, "rev-parse", "HEAD"), "--path", "runs/closed",
      "--repository", "example/evidence", "--output", f.archive, "--manifest", f.manifest));
    ok(f.verify());
    ok(f.restore());
    expect(readFileSync(join(f.dir, "restored/runs/closed", ("long folder ".repeat(10) + "data"), "résumé.txt"), "utf8"))
      .toBe("Unicode evidence.\n");
  });

  it("captures ignored working files explicitly while retaining the candidate commit as provenance", () => {
    const f = fixture();
    writeFileSync(join(f.repo, ".gitignore"), "*.log\n");
    writeFileSync(join(f.repo, "runs/closed/input.txt"), "Latest working prompt.\n");
    writeFileSync(join(f.repo, "runs/closed/response.log"), "Ignored raw response.\n");
    ok(run("pack", "--repo", f.repo, "--ref", f.sha, "--path", "runs/closed", "--working-tree",
      "--repository", "example/evidence", "--output", f.archive, "--manifest", f.manifest));
    ok(f.verify());
    ok(f.restore());
    expect(readFileSync(join(f.dir, "restored/runs/closed/input.txt"), "utf8")).toBe("Latest working prompt.\n");
    expect(readFileSync(join(f.dir, "restored/runs/closed/response.log"), "utf8")).toBe("Ignored raw response.\n");
    const descriptor = JSON.parse(readFileSync(f.manifest, "utf8")) as { source: { capture: string; commit: string } };
    expect(descriptor.source).toMatchObject({ capture: "working-tree", commit: f.sha });
  });

  it.each(["mutate", "add", "remove"])("refuses a working-tree %s during capture and removes partial outputs", (change) => {
    const f = fixture();
    // Deterministically change real files at the second-read boundary. Depending
    // on a racing background writer would make the retention check flaky.
    const injection = `
import importlib.util, pathlib, sys
spec = importlib.util.spec_from_file_location('evidence_archive', sys.argv[1])
module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
change, repo = sys.argv[2:4]
root = pathlib.Path(repo)
if change == 'mutate':
    original = module.HashingReader.read
    fired = False
    def changed(self, size=-1):
        global fired
        if not fired:
            fired = True
            (root / 'runs/closed/input.txt').write_text('Changed prompt.\\n')
        return original(self, size)
    module.HashingReader.read = changed
else:
    original = module.working_entries
    calls = 0
    def changed(*args):
        global calls
        calls += 1
        if calls == 2:
            path = root / ('runs/closed/added.log' if change == 'add' else 'runs/closed/input.txt')
            if change == 'add': path.write_text('New evidence')
            else: path.unlink()
        return original(*args)
    module.working_entries = changed
sys.argv = [sys.argv[1]] + sys.argv[4:]
sys.exit(module.main())
`;
    const result = command(python, ["-c", injection, script, change, f.repo, "pack", "--repo", f.repo,
      "--ref", f.sha, "--path", "runs/closed", "--working-tree", "--repository", "example/evidence",
      "--output", f.archive, "--manifest", f.manifest]);
    expect(result.status, result.stdout).toBe(1);
    expect(existsSync(f.archive)).toBe(false);
    expect(existsSync(f.manifest)).toBe(false);
  });

  // Windows file symlinks require privileges unavailable on ordinary CI runners.
  it.skipIf(process.platform === "win32")("rejects links both inside a capture and in selected path ancestors", () => {
    const f = fixture();
    const outside = join(f.dir, "outside");
    mkdirSync(outside);
    writeFileSync(join(outside, "private.log"), "Outside evidence boundary.\n");
    symlinkSync(outside, join(f.repo, "runs/closed/linked"));
    for (const prefix of ["runs/closed", "runs/closed/linked/private.log"]) {
      const result = run("pack", "--repo", f.repo, "--ref", f.sha, "--path", prefix, "--working-tree",
        "--repository", "example/evidence", "--output", f.archive, "--manifest", f.manifest);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("link");
      expect(existsSync(f.archive)).toBe(false);
    }
    ok(f.pack()); // Git capture reads objects, so this untracked link is irrelevant.
    const destination = join(f.dir, "restore-link");
    symlinkSync(outside, destination);
    expect(f.restore(destination).status).toBe(1);
    expect(readFileSync(join(outside, "private.log"), "utf8")).toBe("Outside evidence boundary.\n");
    expect(existsSync(join(outside, "runs"))).toBe(false);
  });

  it.each([
    ["hash-to-verify", "replace"], ["hash-to-verify", "truncate"],
    ["verify-to-restore", "replace"], ["verify-to-restore", "truncate"],
    ["during-restore", "replace"], ["during-restore", "truncate"],
  ])("rejects archive %s/%s changes and leaves no restore directory", (boundary, change) => {
    const f = fixture();
    ok(f.pack());
    // Both archives have valid embedded hashes, matching provenance, counts and
    // payload lengths. Only the trusted outer hash distinguishes their contents.
    writeFileSync(join(f.repo, "runs/closed/input.txt"), "Modified prompt.\n");
    const replacement = join(f.dir, "replacement.tar.gz");
    ok(run("pack", "--repo", f.repo, "--ref", f.sha, "--path", "runs/closed", "--working-tree",
      "--repository", "example/evidence", "--output", replacement, "--manifest", join(f.dir, "REPLACEMENT.json")));
    // Give the replacement identical capture provenance as well: it models an
    // attacker replacing a complete archive after its original hash was checked.
    const injection = `
import importlib.util, io, json, pathlib, sys, tarfile
spec = importlib.util.spec_from_file_location('evidence_archive', sys.argv[1])
module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
boundary, change, archive, replacement = sys.argv[2:6]
with tarfile.open(replacement, 'r:gz') as source:
    members = [(member, source.extractfile(member).read()) for member in source]
manifest = json.loads(members[0][1]); manifest['source']['capture'] = 'git'
encoded = json.dumps(manifest).encode(); members[0][0].size = len(encoded)
members[0] = (members[0][0], encoded)
with tarfile.open(replacement, 'w:gz') as output:
    for member, data in members: output.addfile(member, io.BytesIO(data))
replacement_bytes = pathlib.Path(replacement).read_bytes()
fired = False
def mutate():
    global fired
    if fired: return
    fired = True
    path = pathlib.Path(archive)
    path.write_bytes(replacement_bytes if change == 'replace' else path.read_bytes()[:32])
if boundary == 'hash-to-verify':
    original = module.digest_stream
    def intervening(*args, **kwargs):
        result = original(*args, **kwargs)
        mutate()
        return result
    module.digest_stream = intervening
else:
    original = module.inspect_payload
    def intervening(raw, descriptor, destination=None):
        original(raw, descriptor, destination)
        if (boundary == 'verify-to-restore' and destination is None) or (boundary == 'during-restore' and destination is not None):
            mutate()
    module.inspect_payload = intervening
sys.argv = [sys.argv[1]] + sys.argv[6:]
sys.exit(module.main())
`;
    const destination = join(f.dir, "changed-archive-restore");
    const result = command(python, ["-c", injection, script, boundary, change, f.archive, replacement,
      "restore", "--archive", f.archive, "--manifest", f.manifest, "--destination", destination]);
    expect(result.status, result.stdout).toBe(1);
    expect(result.stderr).toContain("Archive changed");
    expect(existsSync(destination)).toBe(false);
  });

  it("removes a partial restore after an operating-system write failure", () => {
    const f = fixture();
    ok(f.pack());
    // Inject an OS error after writing a real payload file. Real permission
    // failures differ across Windows and privileged POSIX test environments.
    const injection = `
import importlib.util, pathlib, sys
spec = importlib.util.spec_from_file_location('evidence_archive', sys.argv[1])
module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
def denied(*args, **kwargs): raise PermissionError('Injected filesystem failure')
pathlib.Path.chmod = denied
sys.argv = sys.argv[1:]
sys.exit(module.main())
`;
    const destination = join(f.dir, "failed-restore");
    const result = command(python, ["-c", injection, script, "restore", "--archive", f.archive,
      "--manifest", f.manifest, "--destination", destination]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("PermissionError");
    expect(existsSync(destination)).toBe(false);
  });

  it("rejects dependency installations in working captures without silently omitting them", () => {
    const f = fixture();
    mkdirSync(join(f.repo, "runs/closed/node_modules"));
    writeFileSync(join(f.repo, "runs/closed/node_modules/module.js"), "temporary installation");
    const result = run("pack", "--repo", f.repo, "--ref", f.sha, "--path", "runs/closed", "--working-tree",
      "--repository", "example/evidence", "--output", f.archive, "--manifest", f.manifest);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("dependency");
    expect(existsSync(f.archive)).toBe(false);
  });

  it("ignores local Git replacement refs so the recorded commit identifies the actual bytes", () => {
    const f = fixture();
    writeFileSync(join(f.repo, "runs/closed/input.txt"), "Replacement content.\n");
    git(f.repo, "add", ".");
    git(f.repo, "commit", "-qm", "Replacement fixture");
    git(f.repo, "replace", f.sha, git(f.repo, "rev-parse", "HEAD"));
    ok(f.pack());
    ok(f.restore());
    expect(readFileSync(join(f.dir, "restored/runs/closed/input.txt"), "utf8")).toBe("Original prompt.\n");
  });

  it("refuses overwriting archives, manifests or an existing restore destination", () => {
    const f = fixture();
    ok(f.pack());
    const original = readFileSync(f.archive);
    expect(f.pack().status).toBe(1);
    expect(readFileSync(f.archive)).toEqual(original);
    const destination = join(f.dir, "existing");
    mkdirSync(destination);
    writeFileSync(join(destination, "keep.txt"), "Keep.\n");
    expect(f.restore(destination).status).toBe(1);
    expect(readFileSync(join(destination, "keep.txt"), "utf8")).toBe("Keep.\n");
    expect(existsSync(join(destination, "runs"))).toBe(false);
  });

  it("rejects absent or traversal prefixes and moving refs without producing outputs", () => {
    const f = fixture();
    expect(f.pack(undefined, undefined, "missing").status).toBe(1);
    expect(f.pack(undefined, undefined, "../runs").status).toBe(1);
    expect(run("pack", "--repo", f.repo, "--ref", "HEAD", "--path", "runs/closed", "--repository", "example/evidence",
      "--output", f.archive, "--manifest", f.manifest).status).toBe(1);
    expect(existsSync(f.archive)).toBe(false);
    expect(existsSync(f.manifest)).toBe(false);
  });

  it("rejects Git symlink objects even when no working-tree symlink exists", () => {
    const f = fixture();
    const blob = git(f.repo, "rev-parse", `${f.sha}:runs/closed/input.txt`);
    git(f.repo, "update-index", "--add", "--cacheinfo", `120000,${blob},runs/closed/link`);
    git(f.repo, "commit", "-qm", "Symlink fixture");
    const result = run("pack", "--repo", f.repo, "--ref", git(f.repo, "rev-parse", "HEAD"), "--path", "runs/closed",
      "--repository", "example/evidence", "--output", f.archive, "--manifest", f.manifest);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("nonregular");
    expect(existsSync(f.archive)).toBe(false);
  });

  it("detects outer corruption and declared resource limits before restore writes", () => {
    const f = fixture();
    ok(f.pack());
    expect(run("verify", "--archive", f.archive, "--manifest", f.manifest, "--max-files", "2").status).toBe(1);
    expect(run("verify", "--archive", f.archive, "--manifest", f.manifest, "--max-payload-bytes", "1").status).toBe(1);
    const bytes = readFileSync(f.archive);
    bytes[20] = bytes[20]! ^ 1;
    writeFileSync(f.archive, bytes);
    expect(f.restore().status).toBe(1);
    expect(existsSync(join(f.dir, "restored"))).toBe(false);
  });

  it.each(["duplicate", "missing", "unlisted", "traversal", "absolute", "backslash", "payload", "mode", "symlink",
    "source", "counts", "collision", "file-directory", "pax-bomb", "trailing", "padding-bomb"])("rejects %s attacks with a matching outer hash before creating a restore directory", (attack) => {
    const f = fixture();
    ok(f.pack());
    forge(f, attack);
    const result = f.restore();
    expect(result.status, result.stdout).toBe(1);
    expect(existsSync(join(f.dir, "restored"))).toBe(false);
    expect(existsSync(join(f.dir, "escaped.txt"))).toBe(false);
  });
});
