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
/**
 * The exact paths `scripts/repo-hygiene.mjs` exempts from the size budget, read out of its source.
 *
 * The script is a CLI entrypoint with no exports — importing it runs `main` — so the map cannot be
 * read as a value; its literals are matched instead. The block is anchored on the declaration and
 * the parse throws when it moves, because a silent zero-length list would exempt nothing and pass.
 */
function exemptedPaths(): readonly string[] {
  const source = readFileSync(SCRIPT, "utf8");
  const block = /const LARGE_FILE_EXCEPTIONS = new Map\(\[(.*?)^\]\)$/ms.exec(source)?.[1];
  if (block === undefined) throw new Error(`${SCRIPT} declares no LARGE_FILE_EXCEPTIONS map`);
  return [...block.matchAll(/^ *\['([^']+)',/gm)].map((match) => match[1] ?? "");
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

  it("refuses new eval transcripts and task inputs while grandfathering tracked calibration captures", () => {
    const root = fixture();
    // Run 11's calibration captures are tracked history: they stay, and editing them is not an addition.
    const historical = ["C1.transcript.txt", "C1.input.md"]
      .map(name => `evals/runs/2026-09-10-run-11/calibration/${name}`);
    for (const path of historical) write(root, path);
    git(root, "add", ".");
    git(root, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid",
      "-c", "commit.gpgsign=false", "commit", "-qm", "historical calibration evidence");
    for (const path of historical) write(root, path, "edited\n");
    const raw = ["evals/runs/new/calibration/C2.transcript.txt", "evals/runs/new/calibration/C2.input.md",
      "evals/runs/new/case-1.transcript.txt", "evals/runs/new/case-1.input.md"];
    const kept = ["evals/runs/new/calibration/C2.grade.txt", "evals/runs/new/calibration/C2.metadata.json",
      "evals/runs/new/calibration/fixtures.json", "evals/runs/new/RESULTS.md",
      "docs/examples/case.transcript.txt", "docs/examples/case.input.md", "test/fixtures/case.input.md"];
    for (const path of [...raw, ...kept]) write(root, path);
    git(root, "add", ".");
    const result = run(root, "--base", "HEAD");
    expect(result.status, result.stderr).toBe(1);
    for (const path of raw) expect(result.stderr, `${path} was not refused`).toContain(JSON.stringify(path));
    for (const path of [...historical, ...kept]) expect(result.stderr).not.toContain(JSON.stringify(path));
  });

  it("ignores Claude Code session state, tool caches, process locks and root pack output", () => {
    const root = fixture();
    write(root, ".gitignore", readFileSync(join(ROOT, ".gitignore"), "utf8"));
    const ignored = [".claude/scheduled_tasks.lock", ".claude/scheduled_tasks.json",
      ".claude/routines/.state/run.json", ".claude/checkpoints/cp-1.json", ".claude/mailbox/inbox.json",
      ".claude/agent-registry.json", ".claude/agent-memory-local", ".claude/first-run",
      ".claude/assistant-daemon-state.json", "scripts/__pycache__/tool.cpython-312.pyc",
      ".venv/bin/python", "tools/.pytest_cache/v/cache/lastfailed", ".cache/tool/entry.json",
      "worker.pid", "scripts/daemon.pid.lock", "stamity-1.10.0.tgz"];
    // Emitted client files share .claude/ with the session state, and a nested tarball is not pack output.
    const kept = [".claude/settings.json", ".claude/agents/reviewer.md", ".claude/rules/testing.md",
      ".claude/skills/st-qa/SKILL.md", ".claude/routines/weekly.md", "nested/.claude/first-run",
      "test/fixtures/archive.tgz"];
    for (const path of [...ignored, ...kept]) write(root, path);
    const status = (path: string): number =>
      spawnSync("git", ["-C", root, "check-ignore", "-q", "--no-index", "--", path]).status ?? -1;
    for (const path of ignored) expect(status(path), `${path} is not ignored`).toBe(0);
    for (const path of kept) expect(status(path), `${path} is ignored`).toBe(1);
  });

  it("leaves no tracked file matched by the repository's own ignore rules", () => {
    // --exclude-per-directory reads only the tree's .gitignore files, so a contributor's global
    // excludes or .git/info/exclude cannot change the answer.
    const matched = git(ROOT, "ls-files", "--cached", "--ignored", "--exclude-per-directory=.gitignore");
    expect(matched).toBe("");
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

  // TEST CHANGE, justified (2026-10-01, the 1.11.0 close): the case asserted the map's three 1.11.0
  // entries; the 1.11.0 close archived run 37's, run 38's and run 39's summaries into
  // evidence-archive-2026-10-01 and compacted them, so all three entries retired and the expected
  // list is empty again, as after the 1.9.0 and 1.10.0 closes. An empty list would make the old
  // exempt-path body vacuous, so the case proves the retirement it asserts: every retired path — the
  // 1.9.0 pair, the 1.10.0 pair and the 1.11.0 trio — is staged over budget beside its
  // same-directory neighbour and all of them must be refused. A map that names any path fails the
  // first expectation, and exemptedPaths still throws if the declaration moves.
  //
  // TEST CHANGE, justified (2026-10-08, the 1.12.0 release): the 1.12.0 window opens one entry —
  // run 42, the full 1.12.0 measure, FAIL only on one ungraded floor sample, whose summary the
  // composed increment run 43 reads from the retention commit — so the expected list is that one
  // path, and the case exercises it as d46367d6 did: the exempted path passes over budget while its
  // same-directory neighbour is refused. The retirement proof is unchanged: every retired summary
  // and its neighbour is still staged over budget and must be refused like any other file.
  it("exempts exactly the run 42 summary and refuses its neighbour and the retired run summaries", () => {
    const exempt = exemptedPaths();
    expect(exempt, "the size-exception map's paths are not the 1.12.0 window's run 42 summary").toEqual([
      "evals/runs/2026-10-08-run-42/summary.json",
    ]);

    const root = fixture();
    const retired = [
      "evals/runs/2026-09-21-run-31/summary.json",
      "evals/runs/2026-09-22-run-32/summary.json",
      "evals/runs/2026-09-27-run-34/summary.json",
      "evals/runs/2026-09-27-run-35/summary.json",
      "evals/runs/2026-10-01-run-37/summary.json",
      "evals/runs/2026-10-01-run-38/summary.json",
      "evals/runs/2026-10-01-run-39/summary.json",
    ];
    const neighbours = [...exempt, ...retired].map((path) => path.replace(/[^/]+$/, "inputs.json"));
    const refused = [...retired, ...neighbours];
    for (const path of [...exempt, ...refused]) write(root, path, "x".repeat(1024 * 1024 + 1));
    git(root, "add", ".");
    const result = run(root, "--base", "HEAD");
    expect(result.status, result.stderr).toBe(1);
    for (const path of refused) expect(result.stderr, `${path} was not refused`).toContain(path);
    for (const path of exempt) expect(result.stderr, `${path} was refused`).not.toContain(path);
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

/**
 * An address at a domain no reserved-domain drop covers, assembled at run time: the leak gate's
 * email rule reads this file, so a literal would be a hit here. No part names a real mailbox.
 */
const PROBE_LOCAL = ["jane", ".roe"].join("");
const PERSON = [PROBE_LOCAL, ["unreserved", "-probe.io"].join("")].join("@");
const commit = (root: string, message: string): void => {
  git(root, "add", ".");
  git(root, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid",
    "-c", "commit.gpgsign=false", "commit", "-qm", message);
};

describe("repository hygiene — email addresses in added lines", () => {
  it("refuses an added address by path and line, and never prints it", () => {
    const root = fixture();
    write(root, "docs/contact.md", `line one\nwrite to ${PERSON} for access\n`);
    // An added line that itself begins `++` shows as `+++` in the diff: content, not a header.
    write(root, "docs/plus.md", `first\n++ ${PERSON}\n`);
    // The fold: a fullwidth commercial at (U+FF20) renders as an address and is one.
    write(root, "docs/wide.md", `${PERSON.replace("@", String.fromCharCode(0xff20))}\n`);
    git(root, "add", ".");

    const result = run(root, "--base", "HEAD");

    expect(result.status, result.stderr).toBe(1);
    expect(result.stderr).toContain('"docs/contact.md": line 2: email address added');
    expect(result.stderr).toContain('"docs/plus.md": line 2: email address added');
    expect(result.stderr).toContain('"docs/wide.md": line 1: email address added');
    expect(result.stdout).toContain("FAIL");
    expect(`${result.stdout}${result.stderr}`).not.toContain(PROBE_LOCAL);
    // Without a base there are no added lines to read, as for the other --base checks.
    expect(run(root).status).toBe(0);
  });

  it("passes reserved addresses and leaves lines the base already held alone", () => {
    const root = fixture();
    write(root, "docs/old.md", `kept from history: ${PERSON}\n`);
    commit(root, "historical address");
    write(root, "docs/old.md", `kept from history: ${PERSON}\nan edit below it\n`);
    write(root, "docs/new.md", ["jane@probe.invalid", "noreply@example.com",
      "git@github.com:owner/repo.git", "https://token@github.com/owner/repo"].join("\n"));
    git(root, "add", ".");

    const result = run(root, "--base", "HEAD");

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("PASS");
  });

  it("reads added lines in a governance repository too", () => {
    const root = fixture();
    write(root, "CONSTITUTION.md");
    write(root, "EVIDENCE.md");
    commit(root, "governance root");
    write(root, "runs/new/notes.md", `${PERSON}\n`);
    git(root, "add", ".");

    const result = run(root, "--base", "HEAD");

    expect(result.status, result.stderr).toBe(1);
    expect(result.stderr).toContain('"runs/new/notes.md": line 1: email address added');
  });

  it("keeps path and line right when the contributor's config fuses hunks", () => {
    // `diff.interHunkContext` is not overridden by `-U0`: left to it, two edits one line apart
    // arrive as ONE hunk with a context row between them, and an uncounted row shifts every later
    // path and line. The address sits in a second file, after the fused hunk.
    const root = fixture();
    write(root, "docs/a.md", "one\ntwo\nthree\nfour\n");
    commit(root, "two files");
    git(root, "config", "diff.interHunkContext", "10");
    write(root, "docs/a.md", "ONE\ntwo\nTHREE\nfour\n");
    write(root, "docs/b.md", `first\nsecond\n${PERSON}\n`);
    git(root, "add", ".");

    const result = run(root, "--base", "HEAD");

    expect(result.status, result.stderr).toBe(1);
    expect(result.stderr).toContain('"docs/b.md": line 3: email address added');
    expect(result.stderr).not.toContain('"docs/a.md"');
  });

  it("withholds an address held in a path's name, keeping the rest of the path readable", () => {
    const root = fixture();
    write(root, `docs/${PERSON}/notes.md`, `${PERSON}\n`);
    write(root, `node_modules/${PERSON}_index.js`);
    git(root, "add", "--force", ".");

    const result = run(root, "--base", "HEAD");
    const output = `${result.stdout}${result.stderr}`;

    expect(result.status, result.stderr).toBe(1);
    expect(result.stderr).toContain('"docs/<withheld>/notes.md": line 1: email address added');
    expect(result.stderr).toContain('"node_modules/<withheld>_index.js": tracked runtime/dependency/cache file');
    expect(output).not.toContain(PROBE_LOCAL);
  });

  it("names a path holding a space by its real name", () => {
    // Git ends such a `+++` header with a tab; the finding names the file, not the header.
    const root = fixture();
    write(root, "docs/my notes.md", `${PERSON}\n`);
    git(root, "add", ".");

    const result = run(root, "--base", "HEAD");

    expect(result.status, result.stderr).toBe(1);
    expect(result.stderr).toContain('"docs/my notes.md": line 1: email address added');
  });

  it.skipIf(process.platform === "win32")("names a C-quoted path by its real name", () => {
    // Git quotes a path holding a double quote even with core.quotePath off; the finding must
    // name the file, not Git's escaped spelling of it. No such filename is legal on Windows.
    const root = fixture();
    write(root, 'docs/say "hi".md', `${PERSON}\n`);
    git(root, "add", ".");

    const result = run(root, "--base", "HEAD");

    expect(result.status, result.stderr).toBe(1);
    expect(result.stderr).toContain(`${JSON.stringify('docs/say "hi".md')}: line 1: email address added`);
  });
});

function manifest(): string {
  return JSON.stringify({ schemaVersion: 1, format: "tar.gz",
    source: { repository: "zomarit/stamity", commit: "a".repeat(40), capture: "git", paths: ["evals/runs/new/calls"] },
    archive: { file: "evidence.tar.gz", sha256: "b".repeat(64), bytes: 120,
      url: "https://github.com/zomarit/stamity/releases/download/evidence-2026-09/evidence.tar.gz" },
    files: 2, payloadBytes: 300 });
}
