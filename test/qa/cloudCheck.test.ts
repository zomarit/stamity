import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { parse } from "yaml";
import { MORNING_REFUSED as ENGINE_MORNING_REFUSED, MORNING_SECTIONS as ENGINE_MORNING_SECTIONS } from "../../src/runs/morning.ts";
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

  it("fails main and the baseline tag disagreeing, even when the pull request is clean", () => {
    // TEST CHANGE (review/8): with no --main the tag alone cannot say which of the two moved, so
    // the reason names the disagreement rather than "main moved".
    const verdict = verdictFor([pr()], files(), refs({ main: "b".repeat(40) }));
    expect(verdict.verdict).toBe("failed");
    expect(verdict.reason).toContain("disagree");
    expect(verdict.reason).toContain("--main");
  });

  it("with --main, fails main and the tag moved together, and names a tag moved alone as the tag (review/8)", () => {
    const moved = "b".repeat(40);
    const together = refs({ main: moved, tags: [{ name: cloud.BASE_TAG, sha: moved }] });
    // Read against the tag alone, the pair moved together looks unchanged, and the pass says so.
    const alone = verdictFor([pr()], files(), together);
    expect(alone.verdict).toBe("pass");
    expect(alone.reason).toContain("no --main given");

    const checked = cloud.verdictForCloud([pr()], files(), together, { expectedMain: BASE_SHA }) as Verdict;
    expect(checked.verdict).toBe("failed");
    expect(checked.reason).toContain("main moved");
    expect(checked.reason).toContain(`the baseline tag ${cloud.BASE_TAG} moved`);

    const tagOnly = cloud.verdictForCloud([pr()], files(), refs({ tags: [{ name: cloud.BASE_TAG, sha: moved }] }), { expectedMain: BASE_SHA }) as Verdict;
    expect(tagOnly.verdict).toBe("failed");
    expect(tagOnly.reason).toContain(`the baseline tag ${cloud.BASE_TAG} moved`);
    expect(tagOnly.reason).not.toContain("main moved");

    const clean = cloud.verdictForCloud([pr()], files(), refs(), { expectedMain: BASE_SHA }) as Verdict;
    expect(clean.verdict).toBe("pass");
    expect(clean.reason).toContain("(--main)");
  });

  it("reads a morning list opening ## Refused as not-run (pre-flight refused: <reason>), never failed (review/9)", () => {
    const body = [
      `# Morning list — ${RUN_ID}`,
      "",
      "## Refused",
      "",
      "- direct-push: the account administers the repository\u0007 and can lift a repository ruleset — fix: run as an account or token without admin on this repository",
      "",
      "## For you to check",
      "",
      "none",
      "",
      runMarker(RUN_ID),
    ].join("\n");
    const verdict = verdictFor([pr({ body, title: "Refused: Run x" })], {}, refs());
    expect(verdict.verdict).toBe("not-run");
    expect(verdict.reason).toMatch(/^pre-flight refused: direct-push: the account administers the repository/);
    expect(verdict.reason).toContain("without admin on this repository");
    expect(verdict.reason).not.toContain("\u0007");
    expect(cloud.refusalFromBody(morningBody())).toBeNull();
    expect(cloud.MORNING_REFUSED).toBe(ENGINE_MORNING_REFUSED);

    // A refused run that also moved main is a failure, not a refusal.
    expect(verdictFor([pr({ body })], {}, refs({ main: "b".repeat(40) })).verdict).toBe("failed");
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

  it("takes --main as the sha setup printed, and refuses one that is not a full sha before any call (review/8)", async () => {
    const printed: string[] = [];
    const print = (line: string) => printed.push(line);
    const args = ["verify", "--repo", "qa-owner/stamity-cloud-claude", "--client", "claude"];
    expect(await cloud.main([...args, "--main", BASE_SHA], { rest: fakeRest(cleanRepoTable()).rest, print })).toBe(0);
    expect(printed[0]).toContain("(--main)");
    expect(await cloud.main([...args, "--main", "c".repeat(40)], { rest: fakeRest(cleanRepoTable()).rest, print })).toBe(1);
    expect(printed[1]).toMatch(/^failed \(.*main moved/);

    const { rest, calls } = fakeRest(cleanRepoTable());
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      expect(await cloud.main([...args, "--main", "abc123"], { rest, print })).toBe(2);
    } finally {
      stderr.mockRestore();
    }
    expect(calls).toEqual([]);
  });
});

const CANDIDATE = { name: "@zomarit/stamity", version: "1.16.0-rc", filename: "zomarit-stamity-1.16.0-rc.tgz" };

/**
 * An npm that records its calls: `run build` does nothing (this checkout's `dist/` is built by
 * `ensureDistBuilt`), `pack` writes a stand-in tarball where it was told and prints npm's
 * JSON, `install --package-lock-only` writes a stand-in lockfile. Mock reason: network and time — the
 * lockfile resolve reads the npm registry, and a real pack of this checkout takes seconds a case.
 */
function fakeNpm() {
  const calls: { cwd: string; args: string[] }[] = [];
  const npm = (cwd: string, args: string[]) => {
    calls.push({ cwd, args });
    if (args[0] === "run" && args[1] === "build") return "";
    if (args[0] === "pack") {
      const dest = args[args.indexOf("--pack-destination") + 1]!;
      writeFileSync(join(dest, CANDIDATE.filename), "stand-in tarball\n");
      return JSON.stringify([{ ...CANDIDATE, id: `${CANDIDATE.name}@${CANDIDATE.version}` }]);
    }
    if (args[0] === "install") {
      writeFileSync(join(cwd, "package-lock.json"), `${JSON.stringify({ name: "stamity-cloud-check", lockfileVersion: 3 })}\n`);
      return "";
    }
    throw new Error(`unexpected npm ${args.join(" ")}`);
  };
  return { npm, calls };
}

/** A minimal fixture: a repository with one commit, standing in for `createFixture` where its contents are not read. */
function bareFixture({ tool, baseDir }: { tool: string; baseDir: string }) {
  const dir = mkdtempSync(join(baseDir, `stamity-qa-${tool}-`));
  const git = (args: string[]) => execFileSync("git", args, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  git(["init", "--quiet", "--initial-branch", "main"]);
  git(["config", "user.email", "qa@invalid.local"]);
  git(["config", "user.name", "stamity qa harness"]);
  writeFileSync(join(dir, "scratch-seed.txt"), "fixture\n");
  git(["add", "-A"]);
  git(["-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "fixture"]);
  return { dir };
}

/**
 * The setup cases pack this checkout, which may hold a contributor's uncommitted edits while the suite runs, and
 * `setup` now refuses a dirty checkout (review/31). Stub reason: the checkout's own state is not the case under test,
 * so `git status` in this checkout answers clean; every other call goes to `git` as given. The refusal itself is
 * proven on temp repositories in "candidateHead" below.
 */
const overCleanCheckout =
  (git: (cwd: string, args: string[]) => string) =>
  (cwd: string, args: string[]): string =>
    resolve(cwd) === REPO_ROOT && args[0] === "status" ? "" : git(cwd, args);

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
      // TEST CHANGE, justified (review/31, REQ-PROVE-041): setup reads this checkout's status before it packs, so the
      // case runs over a checkout read as clean (`overCleanCheckout`), whatever edits the contributor holds.
      const git = overCleanCheckout((cwd: string, args: string[]) => {
        if (args[0] === "push" || args[0] === "remote") {
          network.push(args);
          return "";
        }
        return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
      });
      const printed: string[] = [];
      const { npm, calls: npmCalls } = fakeNpm();
      const result = await cloud.setup({
        owner: "qa-owner",
        clients: ["claude"],
        dir,
        rest,
        git,
        npm,
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

      // review/8: the morning line carries the sha verify checks main and the tag against.
      expect(text).toContain(`--client claude --main ${head}`);

      // review/7: this checkout's build is packed into the repository and declared, with a
      // lockfile, so `npx --no stamity` there runs the candidate; the start lines say so.
      // review/21: this checkout is built before it is packed, and the start lines name HEAD's sha.
      expect(npmCalls[0]).toEqual({ cwd: REPO_ROOT, args: ["run", "build"] });
      expect(npmCalls[1]).toEqual({ cwd: REPO_ROOT, args: ["pack", "--json", "--ignore-scripts", "--pack-destination", dir] });
      expect(npmCalls[2]).toMatchObject({ cwd: repo!.dir, args: ["install", "--package-lock-only", "--ignore-scripts", "--no-audit", "--no-fund"] });
      const manifest = JSON.parse(readFileSync(join(repo!.dir, "package.json"), "utf8")) as { devDependencies: Record<string, string> };
      expect(manifest.devDependencies).toEqual({ "@zomarit/stamity": `file:./${CANDIDATE.filename}` });
      const tracked = execFileSync("git", ["ls-files"], { cwd: repo!.dir, encoding: "utf8" }).split("\n");
      expect(tracked).toContain(CANDIDATE.filename);
      expect(tracked).toContain("package-lock.json");
      expect(readFileSync(join(repo!.dir, ".gitignore"), "utf8")).toMatch(/^node_modules\/$/m);
      const headShort = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: REPO_ROOT, encoding: "utf8" }).trim();
      expect(text).toContain(`build of HEAD ${headShort} (npm run build), packed as ${CANDIDATE.filename} (@zomarit/stamity 1.16.0-rc)`);
      expect(text).toContain("`npx --no stamity` runs this candidate");
      expect(text).toContain("npm ci");

      // review/9: the start lines state the pre-flight's identity prerequisite and set nothing.
      expect(text).toContain(cloud.PREFLIGHT_PREREQUISITE);
      expect(text).toContain("WITHOUT admin on the repository");
      expect(text).toContain("ORGANIZATION ruleset");
      // The round-2 note: a repository under the running account's personal login cannot pass.
      expect(text).toContain("cannot pass the pre-flight when that same account runs it");
      expect(text).toContain("binds administrators with no bypass");
      expect(text).toContain("qa-owner created these repositories under its personal account and administers them, so a run as qa-owner cannot pass the pre-flight");
      expect(text).toContain("setup created no ruleset");
      expect(text).not.toContain("protect main with no bypass");
      expect(calls.some((call) => /rulesets|protection/.test(call.path))).toBe(false);

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

  it("names a repository already made and pushed when a later client's creation fails (review/10)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "stamity-cloud-check-setup-"));
    temps.push(dir);
    const made = "qa-owner/stamity-cloud-claude-20261018-2100";
    const { rest } = fakeRest({
      "GET /user": { status: 200, json: { login: "qa-owner" } },
      "POST /user/repos": { status: 201, json: { full_name: made, clone_url: `https://github.com/${made}.git` } },
    });
    // The table answers by `METHOD path`, so the second POST is answered 422 here.
    let posts = 0;
    const failingSecond = async (request: RestCall) => {
      if (request.method === "POST") {
        posts += 1;
        if (posts === 2) return { status: 422, json: { message: "name already exists" } };
      }
      return rest(request);
    };
    // TEST CHANGE, justified (review/31, REQ-PROVE-041): this checkout's status is read as clean, as above.
    const git = overCleanCheckout((cwd: string, args: string[]) =>
      args[0] === "push" || args[0] === "remote" ? "" : execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }),
    );
    let message = "";
    try {
      await cloud.setup({
        owner: "qa-owner",
        clients: ["claude", "cursor"],
        dir,
        rest: failingSecond,
        git,
        npm: fakeNpm().npm,
        buildFixture: bareFixture,
        print: () => {},
        now: () => new Date("2026-10-18T21:00:00Z"),
      });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("stamity-cloud-cursor-20261018-2100 answered HTTP 422");
    expect(message).toContain(`made and pushed before it, public: ${made}`);
    expect(message).toContain(`repo delete ${made}`);
  });

  it("names an organization's repositories as passing only the organization-ruleset way, never as a personal account's", async () => {
    const dir = mkdtempSync(join(tmpdir(), "stamity-cloud-check-setup-"));
    temps.push(dir);
    const made = "qa-org/stamity-cloud-claude-20261018-2100";
    const { rest, calls } = fakeRest({
      "GET /user": { status: 200, json: { login: "qa-member" } },
      "POST /orgs/qa-org/repos": { status: 201, json: { full_name: made, clone_url: `https://github.com/${made}.git` } },
    });
    // TEST CHANGE, justified (review/31, REQ-PROVE-041): this checkout's status is read as clean, as above.
    const git = overCleanCheckout((cwd: string, args: string[]) =>
      args[0] === "push" || args[0] === "remote" ? "" : execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }),
    );
    const printed: string[] = [];
    await cloud.setup({
      owner: "qa-org",
      clients: ["claude"],
      dir,
      rest,
      git,
      npm: fakeNpm().npm,
      buildFixture: bareFixture,
      print: (line: string) => printed.push(line),
      now: () => new Date("2026-10-18T21:00:00Z"),
    });
    expect(calls.find((call) => call.method === "POST")!.path).toBe("/orgs/qa-org/repos");
    const text = printed.join("\n");
    expect(text).toContain("qa-member created these repositories and administers them, so a run as qa-member passes only the organization-ruleset way");
    expect(text).not.toContain("under its personal account");
  });

  it("builds this checkout before packing it, and packs nothing when the build fails (review/21)", () => {
    const calls: string[][] = [];
    const npm = (_cwd: string, args: string[]) => {
      calls.push(args);
      throw new Error("npm run build exited 1");
    };
    expect(() => cloud.packCandidate({ repoRoot: REPO_ROOT, dest: tmpdir(), npm })).toThrow("npm run build exited 1");
    expect(calls).toEqual([["run", "build"]]);
  });
});

/**
 * review/31: the short sha `setup` prints names the code it packed, so a checkout with uncommitted edits to a tracked
 * file is refused, before any REST call or build. Real git over temp repositories throughout.
 */
describe("candidateHead — the sha the evidence names (review/31)", () => {
  const temps: string[] = [];
  afterEach(() => {
    for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
  });
  const DIRTY = "the checkout has uncommitted edits; commit or stash them so the evidence names the code the run ran";

  /** A temp repository with one committed file, `scratch-seed.txt`. */
  function repository(): string {
    const base = mkdtempSync(join(tmpdir(), "stamity-cloud-check-head-"));
    temps.push(base);
    return bareFixture({ tool: "head", baseDir: base }).dir;
  }

  it("returns HEAD's short sha on a clean checkout, and on one holding only untracked files", () => {
    const dir = repository();
    const short = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: dir, encoding: "utf8" }).trim();
    expect(cloud.candidateHead(dir, cloud.realGit)).toMatch(/^[0-9a-f]{7,}$/);
    expect(cloud.candidateHead(dir, cloud.realGit)).toBe(short);
    // Outside the staged data folders an untracked file reaches no bundle, so it leaves the evidence true.
    writeFileSync(join(dir, "untracked.txt"), "scratch\n");
    mkdirSync(join(dir, "notes"));
    writeFileSync(join(dir, "notes", "draft.md"), "scratch\n");
    expect(cloud.candidateHead(dir, cloud.realGit)).toBe(short);
  });

  it("throws on an untracked file under a folder the build copies whole into dist/, naming it (review/5)", () => {
    const dir = repository();
    mkdirSync(join(dir, "content", "skills"), { recursive: true });
    writeFileSync(join(dir, "content", "skills", "draft.md"), "draft\n");
    expect(() => cloud.candidateHead(dir, cloud.realGit)).toThrow(/content\/skills\/draft\.md/);
    expect(() => cloud.candidateHead(dir, cloud.realGit)).toThrow(/whole into dist\//);
  });

  it("throws on an ignored file under a staged folder, naming it (review/5)", () => {
    const dir = repository();
    writeFileSync(join(dir, ".gitignore"), "*.local\n");
    execFileSync("git", ["add", ".gitignore"], { cwd: dir });
    execFileSync("git", ["-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "ignore"], { cwd: dir });
    mkdirSync(join(dir, "packs", "demo"), { recursive: true });
    writeFileSync(join(dir, "packs", "demo", "notes.local"), "draft\n");
    expect(() => cloud.candidateHead(dir, cloud.realGit)).toThrow(/packs\/demo\/notes\.local/);
  });

  it("throws on a modified tracked file, and on a staged one", () => {
    const dir = repository();
    writeFileSync(join(dir, "scratch-seed.txt"), "edited\n");
    expect(() => cloud.candidateHead(dir, cloud.realGit)).toThrow(DIRTY);
    execFileSync("git", ["add", "scratch-seed.txt"], { cwd: dir });
    expect(() => cloud.candidateHead(dir, cloud.realGit)).toThrow(DIRTY);
  });

  it("refuses setup over a dirty checkout before any REST call or build", async () => {
    const repoRoot = repository();
    writeFileSync(join(repoRoot, "scratch-seed.txt"), "edited\n");
    const dir = mkdtempSync(join(tmpdir(), "stamity-cloud-check-setup-"));
    temps.push(dir);
    const { rest, calls } = fakeRest({ "GET /user": { status: 200, json: { login: "qa-owner" } } });
    const { npm, calls: npmCalls } = fakeNpm();
    await expect(cloud.setup({ owner: "qa-owner", clients: ["claude"], dir, rest, npm, repoRoot, print: () => {} })).rejects.toThrow(DIRTY);
    expect(calls).toEqual([]);
    expect(npmCalls).toEqual([]);
  });
});

/**
 * build/21: the nightly release-prep job writes the scratch repository's plan and contract at this tool's paths
 * (`check.PLAN_PATH`, `check.CONTRACT_PATH`), and its drive step names both in the prompt as literals. This holds the
 * literals equal to the exports, so a path moved on one side alone turns it red.
 */
describe("the nightly release-prep prompt names this tool's paths (build/21)", () => {
  it("drives /st-work on PLAN_PATH with (run contract: CONTRACT_PATH)", () => {
    const workflow = parse(readFileSync(join(REPO_ROOT, ".github", "workflows", "nightly.yml"), "utf8")) as {
      jobs: Record<string, { steps: { name?: string; run?: string }[] }>;
    };
    const steps = workflow.jobs["release-prep-unattended"]?.steps ?? [];
    expect(steps.some((step) => step.run?.includes("check.PLAN_PATH") && step.run.includes("check.CONTRACT_PATH"))).toBe(true);
    const drive = steps.find((step) => step.name === "Drive (claude)")?.run ?? "";
    expect(drive).toContain(`/st-work --unattended ${cloud.PLAN_PATH as string}`);
    expect(drive).toContain(`(run contract: ${cloud.CONTRACT_PATH as string})`);
  });
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

  it("reads no verify output as not-run, and lets a person sign --walked P1 over a verify pass but not a not-run P1 or a failed P2", async () => {
    const bare = await runHarness([]);
    const p1 = bare.rows.find((entry) => entry.row === "P1")!;
    expect(p1.status).toBe("not-run");
    expect(p1.reason).toContain("cloud-check.mjs verify");

    // TEST CHANGE (review/11): a walk on a cloud row with no verify output is refused before
    // measuring; the walk signs a row whose verify output this run reads.
    await expect(runHarness(["--walked", "P1", "--by", "the maintainer", "--on", "2026-10-19"])).rejects.toThrow(
      "row P1 has no cloud-check.mjs verify output for claude",
    );
    const passDir = tempDir();
    const walked = await runHarness([
      "--cloud", verifyOutput(passDir, "claude", "pass", "PR #1: an open draft"),
      "--walked", "P1", "--by", "the maintainer", "--on", "2026-10-19",
    ]);
    expect(walked.rows.find((entry) => entry.row === "P1")).toMatchObject({ status: "performed", performedBy: "the maintainer" });
    const accepted = await runHarness(["--accept-unwalked", "P1", "--by", "the maintainer", "--on", "2026-10-19"]);
    expect(accepted.rows.find((entry) => entry.row === "P1")).toMatchObject({ status: "accepted-unwalked" });

    // review/20: a verify not-run (no PR, a refused pre-flight) refuses the walk with its reason;
    // --accept-unwalked over it is unchanged.
    const notRunDir = tempDir();
    const notRun = verifyOutput(notRunDir, "claude", "not-run", "pre-flight refused: direct-push");
    await expect(runHarness(["--cloud", notRun, "--walked", "P1", "--by", "the maintainer", "--on", "2026-10-19"])).rejects.toThrow(
      "row P1's cloud-check.mjs verify output for claude reads not-run (pre-flight refused: direct-push), so --walked P1 is refused",
    );
    const acceptedNotRun = await runHarness(["--cloud", notRun, "--accept-unwalked", "P1", "--by", "the maintainer", "--on", "2026-10-19"]);
    expect(acceptedNotRun.rows.find((entry) => entry.row === "P1")).toMatchObject({ status: "accepted-unwalked" });

    // TEST CHANGE (review/20): a failed verify now refuses the walk before measuring, with the
    // verify's reason, where it was refused after measuring as "measured failed".
    const dir = tempDir();
    await expect(
      runHarness(["--cloud", verifyOutput(dir, "cursor", "failed", "main moved"), "--walked", "P2", "--by", "the maintainer"]),
    ).rejects.toThrow("row P2's cloud-check.mjs verify output for cursor reads failed (main moved), so --walked P2 is refused");
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
