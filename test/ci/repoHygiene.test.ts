import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SCRIPT = join(ROOT, "scripts/repo-hygiene.mjs");
const roots: string[] = [];
const git = (root: string, ...args: string[]): string =>
  execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: "pipe" }).trim();
const write = (root: string, path: string, body = "fixture\n"): void => {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), body);
};
function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), "stamity-hygiene-"));
  roots.push(root);
  git(root, "init", "-q");
  write(root, "README.md");
  git(root, "add", ".");
  git(root, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid",
    "-c", "commit.gpgsign=false", "commit", "-qm", "baseline");
  return root;
}
const run = (root: string, ...args: string[]) =>
  spawnSync(process.execPath, [SCRIPT, "--repo", root, ...args], { encoding: "utf8" });
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe("repository hygiene over the Git index", () => {
  it("rejects force-added ignored runtime files and dependencies", () => {
    const root = fixture();
    write(root, ".gitignore", readFileSync(join(ROOT, ".gitignore"), "utf8"));
    const paths = [".claude/worktrees/agent/file.txt", ".claude/settings.local.json",
      ".stamity/review-gate.json", ".stamity/review-gate.json.lock/owner",
      ".stamity/review-gate.json.tmp-deadbeef", ".stamity/_scratch/trace.log",
      ".stamity/_runtime/worker.pid", "node_modules/package/index.js",
      "website/.docusaurus/cache.json", "website/build/index.html", "worker.pid.lock"];
    for (const path of paths) write(root, path);
    git(root, "add", "--force", ".");
    const result = run(root);
    expect(result.status, result.stderr).toBe(1);
    for (const path of paths) expect(result.stderr).toContain(JSON.stringify(path));
  });

  it("keeps generated client config, evidence logs, fixtures and package lockfiles", () => {
    const root = fixture();
    for (const path of [".claude/settings.json", ".claude/agents/reviewer.md", ".apm/agents/reviewer.md",
      ".stamity/generated/hooks/guard.mjs", ".stamity/runs/closed/signing-red.log",
      "test/fixtures/coverage/sample.json", "test/fixtures/node_modules/package/index.js",
      "test/fixtures/worker.pid", "package-lock.json", "website/package-lock.json", "yarn.lock"])
      write(root, path);
    git(root, "add", ".");
    const result = run(root, "--base", "HEAD");
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("PASS");
  });

  it("grandfathers historical payloads but refuses new raw files even beside a manifest", () => {
    const root = fixture();
    write(root, "evals/runs/old/calls/old.output.txt");
    git(root, "add", ".");
    git(root, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid",
      "-c", "commit.gpgsign=false", "commit", "-qm", "historical evidence");
    expect(run(root, "--base", "HEAD").status).toBe(0);
    const raw = ["calls/new.output.txt", "calls.json", "samples.jsonl", "provider-responses.jsonl",
      "judge-case-attempt-1.json", "sample-case-1.json", "isolation-scenario.json"];
    for (const path of raw) write(root, `evals/runs/new/${path}`);
    write(root, "evals/runs/new/ARCHIVE.json", manifest());
    git(root, "add", ".");
    expect(run(root).status).toBe(0);
    const result = run(root, "--base", "HEAD");
    expect(result.status).toBe(1);
    for (const path of raw) expect(result.stderr).toContain(`evals/runs/new/${path}`);
    expect(result.stderr).not.toContain("evals/runs/old/");
  });

  it("checks staged manifest bytes and permits compact run records", () => {
    const root = fixture();
    const path = "evals/runs/new/ARCHIVE.json";
    write(root, path, manifest());
    for (const name of ["RESULTS.md", "PROTOCOL.md", "inputs.json", "summary.json", "calibration.json"])
      write(root, `evals/runs/new/${name}`);
    git(root, "add", ".");
    write(root, path, "not staged JSON");
    expect(run(root, "--base", "HEAD").status).toBe(0);
    git(root, "add", path);
    const result = run(root, "--base", "HEAD");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("invalid archive manifest");
  });

  it("ignores new runner payloads without dropping historical files or compact records", () => {
    const root = fixture();
    const historical = "evals/runs/old/calls/kept.output.txt";
    write(root, historical);
    git(root, "add", ".");
    git(root, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid",
      "-c", "commit.gpgsign=false", "commit", "-qm", "historical evidence");
    write(root, ".gitignore", readFileSync(join(ROOT, ".gitignore"), "utf8"));
    const raw = ["calls/call.output.txt", "calls.json", "samples.jsonl", "judge-case-attempt-1.json",
      "sample-case-1.json", "isolation-judge.json", "provider-responses.jsonl"];
    const compact = ["inputs.json", "summary.json", "calibration.json", "RESULTS.md", "PROTOCOL.md", "ARCHIVE.json"];
    for (const name of [...raw, ...compact]) write(root, `evals/runs/new/${name}`);
    write(root, "test/fixtures/sample-case-1.json");
    write(root, "docs/examples/calls.json");
    git(root, "add", "--all");
    const tracked = git(root, "ls-files").split("\n");
    expect(tracked).toContain(historical);
    for (const name of raw) expect(tracked).not.toContain(`evals/runs/new/${name}`);
    for (const name of compact) expect(tracked).toContain(`evals/runs/new/${name}`);
    expect(tracked).toContain("test/fixtures/sample-case-1.json");
    expect(tracked).toContain("docs/examples/calls.json");
    const ignored = git(root, "check-ignore", "--no-index", "--", ...raw.map(name => `evals/runs/new/${name}`)).split("\n");
    expect(ignored).toEqual(raw.map(name => `evals/runs/new/${name}`));
  });

  it("rejects incomplete manifests and renamed payloads", () => {
    const root = fixture();
    write(root, "evals/runs/new/ARCHIVE.json", JSON.stringify({ schemaVersion: 1 }));
    git(root, "mv", "README.md", "old-output.txt");
    mkdirSync(join(root, "evals/runs/new/calls"), { recursive: true });
    git(root, "mv", "old-output.txt", "evals/runs/new/calls/renamed.output.txt");
    git(root, "add", ".");
    const result = run(root, "--base", "HEAD");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("invalid archive manifest");
    expect(result.stderr).toContain("calls/renamed.output.txt");
  });

  it("fails closed on an unavailable base instead of silently disabling evidence checks", () => {
    const result = run(fixture(), "--base", "missing-base");
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("could not inspect repository");
  });

  it("rejects unknown options", () => {
    expect(run(fixture(), "--skip-raw").status).toBe(2);
  });

  it("applies the new-file budget to staged bytes including compact summaries", () => {
    const root = fixture();
    write(root, "evals/runs/new/summary.json", "x".repeat(1024 * 1024 + 1));
    git(root, "add", ".");
    write(root, "evals/runs/new/summary.json", "{}");
    const result = run(root, "--base", "HEAD");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("1048577 bytes; budget is 1048576");
    expect(run(root).status).toBe(0);
  });

  it("exempts only the exact retained run summary and still refuses its neighbour", () => {
    const root = fixture();
    const exempt = "evals/runs/2026-09-21-run-31/summary.json";
    const neighbour = "evals/runs/2026-09-21-run-31/inputs.json";
    for (const path of [exempt, neighbour]) write(root, path, "x".repeat(1024 * 1024 + 1));
    git(root, "add", ".");
    const result = run(root, "--base", "HEAD");
    expect(result.status, result.stderr).toBe(1);
    expect(result.stderr).toContain(neighbour);
    expect(result.stderr).not.toContain(exempt);
  });

  it.each([
    ["small file crossing the budget", 8, 1048577, "y", 1],
    ["unchanged historical large file", 1048577, 1048577, "x", 0],
    ["shrinking historical large file", 1048578, 1048577, "y", 0],
    ["growing historical large file", 1048577, 1048578, "y", 1],
    ["changed historical large file with equal bytes", 1048577, 1048577, "y", 0],
  ] as const)("checks size growth for a %s", (_label, before, after, fill, expectedStatus) => {
    const root = fixture();
    const path = "evals/runs/old/summary.json";
    write(root, path, "x".repeat(before));
    git(root, "add", ".");
    git(root, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid",
      "-c", "commit.gpgsign=false", "commit", "-qm", "historical summary");
    write(root, path, fill.repeat(after));
    git(root, "add", ".");
    const result = run(root, "--base", "HEAD");
    expect(result.status, result.stderr).toBe(expectedStatus);
    if (expectedStatus === 1) {
      expect(result.stderr).toContain(path);
      expect(result.stderr).toContain(`${after} bytes; budget is 1048576`);
    }
  });

  it.each(["run", "run28"])("detects governance roots and refuses new raw captures in %s while retaining records", (runName) => {
    const root = fixture();
    write(root, "CONSTITUTION.md");
    write(root, "EVIDENCE.md");
    const runRoot = `runs/example/claude-run/${runName}`;
    for (const name of ["config.json", "journal.jsonl", "inspection.json", "grade.json", "process.json", "env.json", "argv.json"])
      write(root, `${runRoot}/${name}`);
    write(root, "runs/example/signing-red.log");
    git(root, "add", ".");
    expect(run(root, "--base", "HEAD").status).toBe(0);
    const raw = ["state.json", "stdout.jsonl", "task.txt", "captures/1.request.body"];
    for (const path of raw) write(root, `${runRoot}/${path}`);
    write(root, `${runRoot}/lock`, "12345");
    git(root, "add", ".");
    const result = run(root, "--base", "HEAD");
    expect(result.status).toBe(1);
    for (const path of [...raw, "lock"]) expect(result.stderr).toContain(`${runRoot}/${path}`);
    expect(run(root, "--kind", "governance").status).toBe(1);
  });

  it("rejects force-added generated governance schemas even without a comparison base", () => {
    const root = fixture();
    write(root, ".gitignore", "runs/\n");
    const paths = ["runs/new/app-server-schema/v2/protocol.json",
      "runs/new/nested/app-server-schema/v2/Message.ts"];
    for (const path of paths) write(root, path, "{}\n");
    git(root, "add", "--force", ".");
    const result = run(root, "--kind", "governance");
    expect(result.status, result.stderr).toBe(1);
    for (const path of paths) expect(result.stderr).toContain(JSON.stringify(path));
    expect(run(root, "--kind", "public", "--base", "HEAD").status).toBe(0);
  });

  it("rejects small force-added closed driver and CI payloads while grandfathering originals", () => {
    const root = fixture();
    const historical = "runs/old/driver/state.json";
    write(root, historical, "{}\n");
    git(root, "add", ".");
    git(root, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid",
      "-c", "commit.gpgsign=false", "commit", "-qm", "historical driver evidence");
    write(root, ".gitignore", "runs/\n");
    const paths = ["runs/new/driver/raw/parent.jsonl", "runs/new/driver/state.json",
      "runs/new/driver/input-snapshot.json", "runs/new/driver/amendments/0001.state-before.json",
      "runs/new/driver/adjudications/0002.state-before.json",
      "runs/new/preflight/incident/before-files/driver/state.json",
      "runs/new/preflight/windows/final-gates/coverage-tests.json",
      "runs/new/eval-run-3.json", "runs/new/eval-run-3.journal.jsonl",
      "runs/new/closeout/build-fleet.journal.jsonl",
      "runs/new/published-verification/docs-pages-artifact/artifact.tar"];
    for (const path of paths) write(root, path, "{}\n");
    git(root, "add", "--force", ".");
    expect(run(root, "--kind", "governance").status).toBe(0);
    const result = run(root, "--kind", "governance", "--base", "HEAD");
    expect(result.status, result.stderr).toBe(1);
    for (const path of paths) expect(result.stderr).toContain(JSON.stringify(path));
    expect(result.stderr).not.toContain(historical);
  });

  it("keeps governance reader source, schemas, regression fixtures and compact records", () => {
    const root = fixture();
    const paths = ["schemas/protocol.json", "src/app-server-schema/v2/Message.ts",
      "test/fixtures/runs/new/app-server-schema/v2/protocol.json",
      "test/fixtures/runs/new/driver/raw/parent.jsonl", "test/fixtures/artifact.tar",
      "runs/new/driver/queue.mjs", "runs/new/driver/config.json", "runs/new/driver/journal.jsonl",
      "runs/new/driver/events.jsonl", "runs/new/driver/README.md", "runs/new/driver/state.schema.json",
      "runs/new/config.json", "runs/new/journal.jsonl", "runs/new/DECISIONS.jsonl",
      "runs/new/signing-red.log", "runs/new/site-image.png",
      "runs/new/preflight/windows/final-gates/execution-analysis.json",
      "runs/new/published-verification/sha256-manifest.json",
      "runs/new/platform-final/signing-artifacts/download-receipts.json"];
    for (const path of paths) write(root, path);
    git(root, "add", ".");
    const result = run(root, "--kind", "governance", "--base", "HEAD");
    expect(result.status, result.stderr).toBe(0);
  });
});

function manifest(): string {
  return JSON.stringify({ schemaVersion: 1, format: "tar.gz",
    source: { repository: "zomarit/stamity", commit: "a".repeat(40), capture: "git", paths: ["evals/runs/new/calls"] },
    archive: { file: "evidence.tar.gz", sha256: "b".repeat(64), bytes: 120,
      url: "https://github.com/zomarit/stamity/releases/download/evidence-2026-09/evidence.tar.gz" },
    files: 2, payloadBytes: 300 });
}
