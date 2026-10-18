import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { MORNING_SECTIONS as ENGINE_MORNING_SECTIONS } from "../../src/runs/morning.ts";
import { runMarker } from "../../src/runs/pullRequest.ts";
import { ensureDistBuilt } from "../support/distBuild.ts";
// @ts-expect-error — native ESM contributor tool, outside the product package.
import * as cloud from "../../scripts/qa/cloud-check.mjs";
// @ts-expect-error — native ESM contributor tool, outside the product package.
import { QA_ROWS, renderForm } from "../../scripts/qa/form.mjs";

/**
 * REQ-PROVE-041 and REQ-PROVE-021 (plan 021 file 2, unit v14-cloud-check): the maintainer's cloud
 * checks, scripted. `verdictForCloud` is pure over what the REST reads returned; `verify` and
 * `setup` reach GitHub only through an injected REST function, which every case here replaces with
 * a table of canned answers (inline mock reason: network and accounts — a real call would need a
 * GitHub login and would create or read a public repository). Everything else is real: `setup`
 * builds its fixture with `createFixture` over this checkout's `dist/cli.js`, commits with the real
 * git binary, and the plan and contract it writes are read by the real `stamity plan check`.
 */

const REPO_ROOT = resolve(import.meta.dirname, "../..");
const BASE_SHA = "a".repeat(40);
const RUN_ID = "2026-10-19_cloud-check";

interface Pr {
  number: number;
  state: "open" | "closed";
  draft: boolean;
  title: string;
  merged_at: string | null;
  body: string;
  head: { ref: string };
}

interface Verdict {
  verdict: "pass" | "failed" | "not-run";
  reason: string;
}

/** A morning-list body as `prBodyFrom` renders it: the title, every section, the run's marker. */
function morningBody(opts: { skip?: string; defaultLine?: boolean; marker?: boolean } = {}): string {
  const lines = [`# Morning list — ${RUN_ID}`, ""];
  for (const name of ENGINE_MORNING_SECTIONS) {
    if (name === opts.skip) continue;
    lines.push(`## ${name}`, "");
    if (name === "Decisions" && opts.defaultLine !== false) {
      lines.push("- Default applied: plan gate → option 1, execute now (unattended)");
    } else {
      lines.push("none");
    }
    lines.push("");
  }
  if (opts.marker !== false) lines.push(runMarker(RUN_ID));
  return lines.join("\n");
}

function pr(overrides: Partial<Pr> = {}): Pr {
  return {
    number: 1,
    state: "open",
    draft: true,
    title: "Run 2026-10-19_cloud-check",
    merged_at: null,
    body: morningBody(),
    head: { ref: `stamity/${RUN_ID}` },
    ...overrides,
  };
}

const RECORD_PATH = `.stamity/runs/${RUN_ID}/record.md`;

function files(mode = "unattended"): Record<string, string> {
  return { [RECORD_PATH]: `# Run ${RUN_ID}\nStatus: closed 2026-10-19\nMode: ${mode}\nBranch: stamity/${RUN_ID}\n` };
}

function refs(overrides: { main?: string; tags?: { name: string; sha: string }[] } = {}) {
  return {
    main: overrides.main ?? BASE_SHA,
    tags: overrides.tags ?? [{ name: cloud.BASE_TAG as string, sha: BASE_SHA }],
  };
}

const verdictFor = (prs: Pr[], f: Record<string, string>, r: ReturnType<typeof refs>): Verdict =>
  cloud.verdictForCloud(prs, f, r) as Verdict;

describe("verdictForCloud", () => {
  it("passes one open draft, unmerged, with the morning list, a Default applied: line, an unattended record and main and the tags unchanged", () => {
    const verdict = verdictFor([pr()], files(), refs());
    expect(verdict.verdict).toBe("pass");
    expect(verdict.reason).toContain("#1");
  });

  it("fails two open drafts as a duplicate", () => {
    const verdict = verdictFor([pr(), pr({ number: 2 })], files(), refs());
    expect(verdict).toMatchObject({ verdict: "failed" });
    expect(verdict.reason).toContain("duplicate");
    expect(verdict.reason).toContain("#1");
    expect(verdict.reason).toContain("#2");
  });

  it("fails a pull request no longer a draft, and passes one titled [DRAFT] where drafts are refused", () => {
    const ready = verdictFor([pr({ draft: false })], files(), refs());
    expect(ready.verdict).toBe("failed");
    expect(ready.reason).toContain("no longer a draft");

    expect(verdictFor([pr({ draft: false, title: "[DRAFT] Run x" })], files(), refs()).verdict).toBe("pass");
  });

  it("fails a merged pull request, and one closed unmerged", () => {
    const merged = verdictFor([pr({ state: "closed", merged_at: "2026-10-19T07:00:00Z" })], files(), refs());
    expect(merged.verdict).toBe("failed");
    expect(merged.reason).toContain("merged");

    const closed = verdictFor([pr({ state: "closed" })], files(), refs());
    expect(closed.verdict).toBe("failed");
    expect(closed.reason).toContain("closed");
  });

  it("fails a moved main even when the pull request is clean", () => {
    const verdict = verdictFor([pr()], files(), refs({ main: "b".repeat(40) }));
    expect(verdict.verdict).toBe("failed");
    expect(verdict.reason).toContain("main moved");
  });

  it("fails a tag added, and a baseline tag gone", () => {
    const added = verdictFor([pr()], files(), refs({ tags: [{ name: cloud.BASE_TAG, sha: BASE_SHA }, { name: "v1.0.0", sha: BASE_SHA }] }));
    expect(added.verdict).toBe("failed");
    expect(added.reason).toContain("v1.0.0");

    const gone = verdictFor([pr()], files(), refs({ tags: [] }));
    expect(gone.verdict).toBe("failed");
    expect(gone.reason).toContain(cloud.BASE_TAG);
  });

  it("reads no PR yet as not-run (no PR)", () => {
    expect(verdictFor([], files(), refs())).toEqual({ verdict: "not-run", reason: "no PR" });
  });

  it("fails a body missing a morning-list section, a Default applied: line or the run marker", () => {
    const section = verdictFor([pr({ body: morningBody({ skip: "Person's calls held" }) })], files(), refs());
    expect(section.verdict).toBe("failed");
    expect(section.reason).toContain("Person's calls held");

    const defaulted = verdictFor([pr({ body: morningBody({ defaultLine: false }) })], files(), refs());
    expect(defaulted.verdict).toBe("failed");
    expect(defaulted.reason).toContain("Default applied:");

    const marker = verdictFor([pr({ body: morningBody({ marker: false }) })], files(), refs());
    expect(marker.verdict).toBe("failed");
    expect(marker.reason).toContain("marker");
  });

  it("fails a record that does not read Mode: unattended, and one absent from the branch", () => {
    const attended = verdictFor([pr()], files("attended"), refs());
    expect(attended.verdict).toBe("failed");
    expect(attended.reason).toContain("Mode: unattended");

    const absent = verdictFor([pr()], {}, refs());
    expect(absent.verdict).toBe("failed");
    expect(absent.reason).toContain(RECORD_PATH);
  });

  it("restates the engine's morning-list sections and run marker, never a drifted copy", () => {
    expect(cloud.MORNING_SECTIONS).toEqual([...ENGINE_MORNING_SECTIONS]);
    expect(cloud.runIdFromBody(`text\n\n${runMarker(RUN_ID)}`)).toBe(RUN_ID);
    expect(cloud.runIdFromBody("no marker here")).toBeNull();
  });
});

interface RestCall {
  method: string;
  path: string;
  body?: unknown;
}

/**
 * A REST function answering from a table by `METHOD path`, recording every call. Mock reason:
 * network and accounts — the real function talks to api.github.com under the operator's login.
 */
function fakeRest(table: Record<string, { status: number; json: unknown }>) {
  const calls: RestCall[] = [];
  const rest = async (request: RestCall) => {
    calls.push(request);
    const answer = table[`${request.method} ${request.path}`];
    return answer ?? { status: 404, json: { message: "Not Found" } };
  };
  return { rest, calls };
}

function base64(text: string): string {
  return Buffer.from(text, "utf8").toString("base64");
}

function cleanRepoTable(prs: Pr[] = [pr()]) {
  return {
    "GET /repos/qa-owner/stamity-cloud-claude/pulls?state=all&per_page=100": { status: 200, json: prs },
    "GET /repos/qa-owner/stamity-cloud-claude/git/ref/heads/main": { status: 200, json: { object: { sha: BASE_SHA } } },
    "GET /repos/qa-owner/stamity-cloud-claude/git/matching-refs/tags": {
      status: 200,
      json: [{ ref: `refs/tags/${cloud.BASE_TAG}`, object: { sha: BASE_SHA, type: "commit" } }],
    },
    [`GET /repos/qa-owner/stamity-cloud-claude/contents/${RECORD_PATH}?ref=${encodeURIComponent(`stamity/${RUN_ID}`)}`]: {
      status: 200,
      json: { encoding: "base64", content: base64(files()[RECORD_PATH]!) },
    },
  };
}

describe("verify — REST reads only", () => {
  const temps: string[] = [];
  afterEach(() => {
    for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it("reads the pull requests, the record on the run branch, main and the tags by GET only, and writes the verdict --out", async () => {
    const { rest, calls } = fakeRest(cleanRepoTable());
    const out = join(mkdtempSync(join(tmpdir(), "stamity-cloud-check-out-")), "claude.json");
    temps.push(resolve(out, ".."));
    const result = await cloud.verify({ repo: "qa-owner/stamity-cloud-claude", client: "claude", rest, out, now: () => new Date("2026-10-19T08:00:00Z") });

    expect(result).toMatchObject({ check: "cloud-check", client: "claude", repo: "qa-owner/stamity-cloud-claude", verdict: "pass" });
    expect(calls.length).toBe(4);
    expect(calls.every((call) => call.method === "GET")).toBe(true);
    expect(JSON.parse(readFileSync(out, "utf8"))).toMatchObject({ verdict: "pass", client: "claude", readAt: "2026-10-19T08:00:00.000Z" });
    expect(cloud.formatVerdict(result)).toMatch(/^pass \(/);
  });

  it("reads a REST failure as not-run with the status, never as a pass", async () => {
    const { rest } = fakeRest({
      ...cleanRepoTable(),
      "GET /repos/qa-owner/stamity-cloud-claude/pulls?state=all&per_page=100": { status: 500, json: null },
    });
    const result = await cloud.verify({ repo: "qa-owner/stamity-cloud-claude", client: "claude", rest });
    expect(result.verdict).toBe("not-run");
    expect(result.reason).toContain("HTTP 500");
  });

  it("refuses a repository or client it cannot name before any call", async () => {
    const { rest, calls } = fakeRest({});
    await expect(cloud.verify({ repo: "qa-owner/../x", client: "claude", rest })).rejects.toThrow("--repo");
    await expect(cloud.verify({ repo: "qa-owner/x", client: "codex", rest })).rejects.toThrow("--client");
    expect(calls).toEqual([]);
  });
});

describe("teardown", () => {
  it("prints the deletion command and runs nothing", async () => {
    const { rest, calls } = fakeRest({});
    const printed: string[] = [];
    const code = await cloud.main(["teardown", "--repo", "qa-owner/stamity-cloud-claude"], {
      rest,
      print: (line: string) => printed.push(line),
      git: () => {
        throw new Error("teardown ran git");
      },
    });
    expect(code).toBe(0);
    expect(calls).toEqual([]);
    expect(printed.join("\n")).toContain("gh repo delete qa-owner/stamity-cloud-claude");

    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      expect(await cloud.main(["teardown", "--repo", "../x"], { rest, print: () => {} })).toBe(2);
    } finally {
      stderr.mockRestore();
    }
  });

  it("exits 0 on a pass and 1 on anything else, printing the verdict line", async () => {
    const printed: string[] = [];
    const print = (line: string) => printed.push(line);
    const args = ["verify", "--repo", "qa-owner/stamity-cloud-claude", "--client", "claude"];
    expect(await cloud.main(args, { rest: fakeRest(cleanRepoTable()).rest, print })).toBe(0);
    expect(await cloud.main(args, { rest: fakeRest(cleanRepoTable([])).rest, print })).toBe(1);
    expect(printed[0]).toMatch(/^pass \(#1: /);
    expect(printed[1]).toBe("not-run (no PR)");
  });
});

describe("setup — a real fixture, REST and the push replaced", () => {
  const temps: string[] = [];
  beforeAll(async () => {
    await ensureDistBuilt();
  }, 300_000);
  afterEach(() => {
    vi.unstubAllEnvs();
    for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it("refuses a --dir inside this checkout before any call", async () => {
    const { rest, calls } = fakeRest({});
    await expect(
      cloud.setup({ owner: "qa-owner", clients: ["claude"], dir: join(REPO_ROOT, "tmp-cloud"), rest, now: () => new Date() }),
    ).rejects.toThrow("inside this repository");
    expect(calls).toEqual([]);
  });

  it(
    "creates a public repository, pushes main and the baseline tag only, and leaves a plan the ready check passes",
    async () => {
      const dir = mkdtempSync(join(tmpdir(), "stamity-cloud-check-setup-"));
      temps.push(dir);
      const { rest, calls } = fakeRest({
        "GET /user": { status: 200, json: { login: "qa-owner" } },
        "POST /user/repos": {
          status: 201,
          json: { full_name: "qa-owner/stamity-cloud-claude-20261018-2100", clone_url: "https://github.com/qa-owner/stamity-cloud-claude-20261018-2100.git", html_url: "https://github.com/qa-owner/stamity-cloud-claude-20261018-2100" },
        },
      });
      const network: string[][] = [];
      // Real git for every local step; `remote` and `push` are recorded instead of run. Mock reason:
      // network and accounts — a push needs the operator's credentials and a real repository.
      const git = (cwd: string, args: string[]) => {
        if (args[0] === "push" || args[0] === "remote") {
          network.push(args);
          return "";
        }
        return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
      };
      const printed: string[] = [];
      const result = await cloud.setup({
        owner: "qa-owner",
        clients: ["claude"],
        dir,
        rest,
        git,
        print: (line: string) => printed.push(line),
        now: () => new Date("2026-10-18T21:00:00Z"),
      });

      const post = calls.find((call) => call.method === "POST")!;
      expect(post.path).toBe("/user/repos");
      expect(post.body).toMatchObject({ name: "stamity-cloud-claude-20261018-2100", private: false });
      expect(calls.filter((call) => call.method !== "GET").length).toBe(1);

      const [repo] = result.repos as { client: string; repo: string; dir: string; mainSha: string }[];
      expect(repo).toMatchObject({ client: "claude", repo: "qa-owner/stamity-cloud-claude-20261018-2100" });
      expect(repo!.dir.startsWith(dir)).toBe(true);
      const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo!.dir, encoding: "utf8" }).trim();
      expect(repo!.mainSha).toBe(head);
      const tagged = execFileSync("git", ["rev-parse", `refs/tags/${cloud.BASE_TAG}`], { cwd: repo!.dir, encoding: "utf8" }).trim();
      expect(tagged).toBe(head);
      expect(network).toEqual([
        ["remote", "add", "origin", "https://github.com/qa-owner/stamity-cloud-claude-20261018-2100.git"],
        ["push", "origin", "refs/heads/main", `refs/tags/${cloud.BASE_TAG}`],
      ]);
      expect(execFileSync("git", ["status", "--porcelain"], { cwd: repo!.dir, encoding: "utf8" })).toBe("");

      const text = printed.join("\n");
      expect(text).toContain("/st-work --unattended");
      expect(text).toContain(cloud.PLAN_PATH);
      expect(text).toContain("machine lock");
      expect(text).toContain("eval run");
      expect(text).toContain("verify --repo qa-owner/stamity-cloud-claude-20261018-2100 --client claude");
      expect(text).toContain("teardown --repo qa-owner/stamity-cloud-claude-20261018-2100");

      expect(existsSync(join(repo!.dir, cloud.CONTRACT_PATH))).toBe(true);
      const check = spawnSync(
        process.execPath,
        [join(REPO_ROOT, "dist", "cli.js"), "plan", "check", cloud.PLAN_PATH, "--contract", cloud.CONTRACT_PATH, "--json"],
        { cwd: repo!.dir, encoding: "utf8" },
      );
      expect(check.status, `${check.stdout}\n${check.stderr}`).toBe(0);
      expect(JSON.parse(check.stdout)).toMatchObject({ ready: true });
    },
    180_000,
  );
});

describe("the form's cloud lane and run.mjs's dispatch", () => {
  const temps: string[] = [];
  afterEach(() => {
    for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  function tempDir(): string {
    const dir = mkdtempSync(join(tmpdir(), "stamity-cloud-check-run-"));
    temps.push(dir);
    return dir;
  }

  function verifyOutput(dir: string, client: string, verdict: string, reason: string): string {
    const path = join(dir, `${client}.json`);
    writeFileSync(path, `${JSON.stringify({ check: "cloud-check", client, repo: `qa-owner/stamity-cloud-${client}`, verdict, reason, readAt: "2026-10-19T08:00:00.000Z" })}\n`);
    return path;
  }

  it("lists P1–P3 in the cloud lane, after the nine rows", () => {
    const cloudRows = (QA_ROWS as { id: string; lane: string; client?: string }[]).filter((row) => row.lane === "cloud");
    expect(cloudRows.map((row) => [row.id, row.client])).toEqual([
      ["P1", "claude"],
      ["P2", "cursor"],
      ["P3", "copilot"],
    ]);
    expect((QA_ROWS as { id: string }[]).map((row) => row.id).slice(-3)).toEqual(["P1", "P2", "P3"]);
  });

  async function runHarness(extra: string[]) {
    // @ts-expect-error — native ESM contributor tool, outside the product package.
    const { main } = await import("../../scripts/qa/run.mjs");
    const out = join(tempDir(), "evidence.json");
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      return (await main(["--skip-browser", "--skip-hooks", "--sha", "c".repeat(40), "--out", out, ...extra])) as {
        rows: { row: string; status: string; reason: string; automated: boolean; inputHashes: Record<string, string> }[];
      };
    } finally {
      write.mockRestore();
    }
  }

  it("dispatches the cloud rows from verify's output, never as page rows, and P3 reads its account reason", async () => {
    const dir = tempDir();
    const evidence = await runHarness(["--cloud", verifyOutput(dir, "claude", "pass", "PR #1: an open draft"), "--cloud", verifyOutput(dir, "cursor", "failed", "main moved")]);
    const row = (id: string) => evidence.rows.find((entry) => entry.row === id)!;

    // A page row with no build under it fails on the missing pages; a cloud row never reads them.
    expect(row("H2").status).toBe("failed");
    expect(row("P1").reason).not.toContain("pages missing");

    expect(row("P1")).toMatchObject({ status: "unperformed", automated: false });
    expect(row("P1").reason).toContain("pass");
    expect(row("P1").reason).toContain("qa-owner/stamity-cloud-claude");
    expect(Object.keys(row("P1").inputHashes).toSorted()).toEqual(["cloud/claude.json", "scripts/qa/cloud-check.mjs"]);
    expect(row("P2")).toMatchObject({ status: "failed", automated: true });
    expect(row("P2").reason).toContain("main moved");
    expect(row("P3")).toMatchObject({ status: "not-run", reason: "no Copilot cloud-agent account" });

    const form = renderForm(evidence) as string;
    expect(form).toContain("| **P3**");
    expect(form.split("\n").find((line) => line.startsWith("| **P3**"))).toContain("no Copilot cloud-agent account");
  });

  it("reads no verify output as not-run, and lets a person sign --walked P1 but not a failed P2", async () => {
    const bare = await runHarness([]);
    const p1 = bare.rows.find((entry) => entry.row === "P1")!;
    expect(p1.status).toBe("not-run");
    expect(p1.reason).toContain("cloud-check.mjs verify");

    const walked = await runHarness(["--walked", "P1", "--by", "the maintainer", "--on", "2026-10-19"]);
    expect(walked.rows.find((entry) => entry.row === "P1")).toMatchObject({ status: "performed", performedBy: "the maintainer" });

    const dir = tempDir();
    await expect(
      runHarness(["--cloud", verifyOutput(dir, "cursor", "failed", "main moved"), "--walked", "P2", "--by", "the maintainer"]),
    ).rejects.toThrow("row P2 was measured failed");
  });

  it("refuses a verify output it cannot read as one, before measuring anything", async () => {
    const dir = tempDir();
    const bad = join(dir, "bad.json");
    writeFileSync(bad, JSON.stringify({ check: "cloud-check", client: "codex", verdict: "pass", reason: "x", repo: "a/b" }));
    await expect(runHarness(["--cloud", bad])).rejects.toThrow("--cloud");
    const twice = verifyOutput(dir, "claude", "pass", "ok");
    await expect(runHarness(["--cloud", twice, "--cloud", twice])).rejects.toThrow("claude");
  });
});
