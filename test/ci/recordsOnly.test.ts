import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
// @ts-expect-error — import-safe native ESM CI helper, outside the product package.
import { decide, isRecordsPath, RECORDS_PATHS, RECORDS_SUITES } from "../../scripts/ci/records-only.mjs";

/**
 * The records-only CI lane's detector, `scripts/ci/records-only.mjs`.
 *
 * What it guards is one direction of one mistake: a change that touches code must never be
 * classified records-only, because that classification skips the three heavy lanes. So every
 * near-miss here is asserted to read `false`, and `true` is asserted only for diffs made of
 * records alone. The CLI half runs against real scratch repositories, because the property that
 * matters — what `git diff` lists — is not visible to the pure half.
 */

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SCRIPT = join(REPO_ROOT, "scripts", "ci", "records-only.mjs");
const SHA = "a".repeat(40);

interface Decision {
  readonly recordsOnly: boolean;
  readonly reason: string;
}
const decideTyped = decide as (input: {
  event: string | undefined;
  base: string | undefined;
  paths: readonly string[];
}) => Decision;
const isRecords = isRecordsPath as (path: string) => boolean;

describe("the records list", () => {
  it("is the four record locations and nothing else", () => {
    expect(RECORDS_PATHS).toEqual([
      ".stamity/runs/**",
      ".stamity/inbox.md",
      ".stamity/handoffs/**",
      "docs/plans/**",
    ]);
  });

  it("matches a file in each record location", () => {
    for (const path of [
      ".stamity/runs/2026-09-30_x/record.md",
      ".stamity/runs/2026-09-30_x/reports/u1-implementer-r1.md",
      ".stamity/inbox.md",
      ".stamity/handoffs/archive/2026-09-22_note_8457c.md",
      "docs/plans/013-optimization-sweep-03.md",
    ]) {
      expect(isRecords(path), path).toBe(true);
    }
  });

  it("refuses every near miss, the learnings and the engine-written keep file", () => {
    for (const path of [
      // The learnings feed the session hook and the troubleshooting count: not a record.
      ".stamity/learnings/some-finding.md",
      // Engine-emitted state scaffold, planned by sync and re-proven by the dogfood check.
      ".stamity/handoffs/.gitkeep",
      ".stamity/runs/.gitkeep",
      // Prefix look-alikes.
      ".stamity/runsX/record.md",
      ".stamity/runs",
      ".stamity/inbox.md.bak",
      ".stamity/inbox.mdx",
      "docs/plans",
      "docs/plans-old/001.md",
      "docs/specs/everyday-flows.md",
      ".stamity/manifest.json",
      "src/cli.ts",
      // Case differs: git paths are case-exact, and the lane fails closed.
      ".Stamity/runs/x.md",
      // A segment that walks back out of the record location.
      ".stamity/runs/../../src/cli.ts",
    ]) {
      expect(isRecords(path), path).toBe(false);
    }
  });

  it("names the suites that read the committed records, and each exists", () => {
    // Confirmed at build (2026-09-30) by reading which suites open the REAL repository-root
    // copies of the four locations: the ledgers and the spec-status walk (test/records), the
    // measurements page rendered from the committed runs, the plan-coverage check over two real
    // plans, and the two leak-gate runs over the whole tree (docsPages and leakGate). The
    // leak-gate evasion and hygiene suites run on scratch trees and are not in the list.
    expect(RECORDS_SUITES).toEqual([
      "test/records",
      "test/docsPages.test.ts",
      "test/cli/docs/measurements.test.ts",
      "test/authoring/specPlanCoverage.test.ts",
      "test/ci/leakGate.test.ts",
    ]);
    for (const suite of RECORDS_SUITES as readonly string[]) {
      expect(existsSync(join(REPO_ROOT, suite)), suite).toBe(true);
    }
  });
});

describe("decide — the pure classification", () => {
  it("reads true for a push or pull request whose every path is a record", () => {
    for (const event of ["push", "pull_request"]) {
      const decision = decideTyped({
        event,
        base: SHA,
        paths: [".stamity/runs/x/record.md", "docs/plans/013-x.md", ".stamity/inbox.md"],
      });
      expect(decision.recordsOnly, event).toBe(true);
    }
  });

  it("reads false the moment one path is not a record", () => {
    const decision = decideTyped({
      event: "push",
      base: SHA,
      paths: [".stamity/runs/x/record.md", "src/cli.ts"],
    });
    expect(decision).toEqual({ recordsOnly: false, reason: expect.stringContaining("src/cli.ts") });
  });

  it("reads false for a learnings change", () => {
    expect(
      decideTyped({ event: "push", base: SHA, paths: [".stamity/learnings/x.md"] }).recordsOnly,
    ).toBe(false);
  });

  it("reads false with no base to compare against", () => {
    for (const base of [undefined, "", "0".repeat(40), "0000000", "not-a-sha", "--output=/tmp/x"]) {
      const decision = decideTyped({ event: "push", base, paths: [".stamity/runs/x/record.md"] });
      expect(decision.recordsOnly, String(base)).toBe(false);
    }
  });

  it("reads false on the schedule, a dispatch, or an event it does not know", () => {
    for (const event of ["schedule", "workflow_dispatch", "merge_group", "", undefined]) {
      const decision = decideTyped({ event, base: SHA, paths: [".stamity/runs/x/record.md"] });
      expect(decision.recordsOnly, String(event)).toBe(false);
    }
  });

  it("reads false for an empty diff, since nothing proves the change is a record", () => {
    expect(decideTyped({ event: "push", base: SHA, paths: [] }).recordsOnly).toBe(false);
  });
});

// ── the CLI, against real scratch repositories ───────────────────────────────

const scratches: string[] = [];
afterEach(() => {
  for (const dir of scratches.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** A throwaway repository with one base commit holding a code file and a record. */
function repository(): { root: string; commit: (message: string) => string; write: (path: string, body: string) => void } {
  const root = mkdtempSync(join(tmpdir(), "stamity-records-only-"));
  scratches.push(root);
  const git = (...args: string[]) =>
    execFileSync(
      "git",
      ["-c", "user.name=fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", ...args],
      { cwd: root, encoding: "utf8" },
    ).trim();
  const write = (path: string, body: string) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), body);
  };
  const commit = (message: string) => {
    git("add", "-A");
    git("commit", "--quiet", "--no-verify", "--allow-empty", "--message", message);
    return git("rev-parse", "HEAD");
  };
  git("init", "--quiet");
  write("src/cli.ts", "export {};\n");
  write(".stamity/runs/r1/record.md", "# record\n");
  write(".stamity/inbox.md", "# inbox\n");
  commit("base");
  return { root, commit, write };
}

function run(root: string, args: readonly string[], env: Record<string, string> = {}) {
  const inherited = { ...process.env };
  delete inherited.GITHUB_OUTPUT;
  delete inherited.GITHUB_EVENT_NAME;
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...inherited, ...env },
    windowsHide: true,
  });
}

describe("records-only.mjs — the CLI over a real diff", () => {
  it("prints records_only=true for a diff touching only a run record", () => {
    const repo = repository();
    const base = repo.commit("noop");
    repo.write(".stamity/runs/x/record.md", "# new record\n");
    repo.write(".stamity/inbox.md", "# inbox, one row more\n");
    repo.commit("records");
    const result = run(repo.root, ["--base", base], { GITHUB_EVENT_NAME: "push" });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe("records_only=true\n");
  });

  it("prints records_only=false when the same diff also touches src/cli.ts", () => {
    const repo = repository();
    const base = repo.commit("noop");
    repo.write(".stamity/runs/x/record.md", "# new record\n");
    repo.write("src/cli.ts", "export const changed = 1;\n");
    repo.commit("records and code");
    const result = run(repo.root, ["--base", base], { GITHUB_EVENT_NAME: "push" });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe("records_only=false\n");
    expect(result.stderr).toContain("src/cli.ts");
  });

  it("sees both sides of a rename, so moving code into a record location is not a record", () => {
    // `git diff --name-only` reports a detected rename by its NEW name only. Without
    // `--no-renames` this diff would list one record path and read true while deleting code.
    const repo = repository();
    const base = repo.commit("noop");
    mkdirSync(join(repo.root, ".stamity/runs/x"), { recursive: true });
    renameSync(join(repo.root, "src/cli.ts"), join(repo.root, ".stamity/runs/x/cli.ts"));
    repo.commit("move code under the runs folder");
    const result = run(repo.root, ["--base", base], { GITHUB_EVENT_NAME: "pull_request" });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe("records_only=false\n");
  });

  it("prints false on the schedule and on a dispatch, even for a records-only diff", () => {
    const repo = repository();
    const base = repo.commit("noop");
    repo.write(".stamity/runs/x/record.md", "# new record\n");
    repo.commit("records");
    for (const event of ["schedule", "workflow_dispatch"]) {
      const result = run(repo.root, ["--base", base], { GITHUB_EVENT_NAME: event });
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout, event).toBe("records_only=false\n");
    }
  });

  it("prints false for an all-zero, empty or absent base, and for a base git does not have", () => {
    const repo = repository();
    repo.write(".stamity/runs/x/record.md", "# new record\n");
    repo.commit("records");
    for (const args of [["--base", "0".repeat(40)], ["--base", ""], [], ["--base", "b".repeat(40)]]) {
      const result = run(repo.root, args, { GITHUB_EVENT_NAME: "push" });
      expect(result.status, `${args.join(" ")}: ${result.stderr}`).toBe(0);
      expect(result.stdout, args.join(" ")).toBe("records_only=false\n");
    }
  });

  it("appends the answer to GITHUB_OUTPUT when the runner provides one", () => {
    const repo = repository();
    const base = repo.commit("noop");
    repo.write("docs/plans/001-x.md", "# plan\n");
    repo.commit("a plan");
    const output = join(repo.root, "..", `${repo.root.split(/[\\/]/).at(-1) ?? "x"}.output`);
    scratches.push(output);
    writeFileSync(output, "earlier=1\n");
    const result = run(repo.root, ["--base", base], { GITHUB_EVENT_NAME: "push", GITHUB_OUTPUT: output });
    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(output, "utf8")).toBe("earlier=1\nrecords_only=true\n");
  });

  it("refuses an argument it does not know, rather than guessing", () => {
    const repo = repository();
    const result = run(repo.root, ["--bsae", "HEAD"], { GITHUB_EVENT_NAME: "push" });
    expect(result.status).toBe(2);
    expect(result.stdout).toBe("");
  });
});
