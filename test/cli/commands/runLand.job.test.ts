// The harness comes first: its module mocks must be in place before any module below loads one they stand in for.
import { editorsPage, gh, git, jobModeHarness, landHarness, MARKER, RUN, RUN_BRANCH, RUN_DIR, taggedLane, thread, threadsPage } from "./runLand.harness.ts";
import type { Seeded, Answer } from "./runLand.harness.ts";
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runCommand } from "../../../src/cli/commands/run.ts";
// The harness's stand-in, never the real door: imported only to pin that it refuses what the real one refuses.
import { ghApi } from "../../../src/cli/engine/ghRunner.ts";
import { LAND_JOB_NAME } from "../../../src/adapters/landWorkflow.ts";
import { requestMarker } from "../../../src/runs/reviewTool.ts";
import { runInProcess } from "../../support/inProcess.ts";

/** `stamity run land`: job mode, all but the lines run end commits. The set-up, the stand-ins and why each one is mocked are in `./runLand.harness.ts`. */

describe("stamity run land", () => {
  const harness = landHarness();
  const { fakeClock, seed, pull, route, put, run, record, kinds } = harness;

  describe("job mode (REQ-FLOW-157)", () => {
    const { LAND_ON, LANDS, BOT, seedJob, lastBody, PATCHED, writes } = jobModeHarness(harness);

    // d-run-cleanup (REQ-FLOW-176): the clean-up is a session's; a job's fresh checkout started nothing to remove.
    it("cleans up nothing when it lands, a lane the run's receipt tags included", async () => {
      const { repo } = await seedJob();
      const lane = await taggedLane(repo, "p-job", RUN);

      const result = await run(repo, LANDS);

      expect(result.doc).toMatchObject({ outcome: "landed" });
      expect(result.doc).not.toHaveProperty("cleanup");
      expect(existsSync(lane)).toBe(true);
      expect(git(repo, ["branch", "--list", RUN_BRANCH])).toContain(RUN_BRANCH);
    });

    it("merges on the evidence with the job's token as viewer, reading nothing a session left under the git directory", async () => {
      const { repo, head } = await seedJob();
      const before = await record(repo);

      const result = await run(repo, LANDS);

      expect(result.code).toBe(0);
      expect(result.doc).toMatchObject({ subcommand: "land", run: RUN, outcome: "landed", pr: { number: 7, head }, notDone: [] });
      expect(gh.calls.find((call) => call.kind === "merge")?.body).toMatchObject({ number: 7, sha: head });
      expect(writes()).toEqual(["PATCH repos/o/r/pulls/7", "merge"]);
      expect(gh.calls.find((call) => call.method === "PATCH")?.body).toMatchObject({ body: expect.stringContaining("evidence checked at") });
      // No `land:` line: the body's evidence line stands, and a job's work tree is gone when it ends.
      expect(await record(repo)).toBe(before);
    });

    it("reads origin's tip from REST, and refuses a branch that moved past the head", async () => {
      const { repo, head } = await seedJob();
      route(`GET repos/o/r/branches/${RUN_BRANCH}`, { commit: { sha: "f".repeat(40) } });
      const result = await run(repo, LANDS);
      expect(result.doc).toMatchObject({ outcome: "refused", notDone: [`origin's ${RUN_BRANCH} is at ${"f".repeat(40)}, not HEAD ${head}`] });
      expect(writes()).toEqual([]);
    });

    it("keeps a thread a person opened and the run closed unresolved under a bot viewer: a hold on the status line, never a red job", async () => {
      const { repo } = await seedJob();
      gh.threads = [threadsPage([thread(true, "runner", ["User", "alice"])], BOT)];

      const result = await run(repo, LANDS);

      expect(result.code).toBe(0);
      expect(result.doc).toMatchObject({ outcome: "refused", evidence: { threads: { unresolved: 1 } }, notDone: ["1 review thread is unresolved"] });
      expect(writes()).toEqual([PATCHED]);
      expect(lastBody()).toContain("merge waits on: 1 review thread is unresolved");
    });

    it("counts a thread the same whichever account the job's token is", async () => {
      const { repo } = await seedJob();
      gh.threads = [threadsPage([thread(true, "runner", ["User", "alice"])], "stamity-land-app")];
      expect((await run(repo, LANDS)).doc).toMatchObject({ outcome: "refused", notDone: ["1 review thread is unresolved"] });

      // A thread a person closed is theirs to close, in the job as at the run's own land.
      gh.threads = [threadsPage([thread(true, "alice", ["User", "alice"])], BOT)];
      expect((await run(repo, LANDS)).doc).toMatchObject({ outcome: "landed" });
    });

    it("holds on a closed thread someone beside its closer wrote in: a status line, a green job, and a person merges by hand", async () => {
      const { repo } = await seedJob();
      gh.threads = [threadsPage([{ ...(thread(true, "bob", ["User", "alice"], ["User", "bob"]) as object), id: "T1" }], BOT)];

      const result = await run(repo, LANDS);

      expect(result.code).toBe(0);
      expect(result.doc).toMatchObject({ outcome: "asks", evidence: { threads: { unresolved: 0 } } });
      expect(writes()).toEqual([PATCHED]);
      expect(lastBody()).toContain("merge waits on: a person decides on closed review threads");
    });

    it("counts a resolver GitHub names as null over a person's comment, in a job and in a session with the job off (review/119)", async () => {
      const { repo } = await seedJob();
      gh.threads = [threadsPage([thread(true, null, ["User", "alice"])], BOT)];
      expect((await run(repo, LANDS)).doc).toMatchObject({ outcome: "refused", evidence: { threads: { unresolved: 1 } } });
      expect(kinds()).not.toContain("merge");

      const session = await seed();
      gh.threads = [threadsPage([thread(true, null, ["User", "alice"])])];
      expect((await run(session.repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "refused", evidence: { threads: { unresolved: 1 } } });
      expect(kinds()).not.toContain("merge");
    });

    it("leaves a thread only bots wrote in, whoever closed it: a null resolver holds a person's comment, and no bot closing its own", async () => {
      const session = await seed();
      gh.threads = [threadsPage([thread(true, null, ["Bot", "review-bot"])])];
      expect((await run(session.repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "landed" });

      const { repo } = await seedJob();
      gh.threads = [threadsPage([thread(true, null, ["Bot", "review-bot"])], BOT)];
      expect((await run(repo, LANDS)).doc).toMatchObject({ outcome: "landed" });
    });

    it("holds the author against the run's login, not the job's viewer", async () => {
      const { repo } = await seedJob();
      gh.threads = [threadsPage([], BOT, BOT)];
      expect((await run(repo, LANDS)).doc).toMatchObject({ outcome: "refused", notDone: [`pull request #7 was opened by ${BOT}, not by the run's login runner`] });

      gh.threads = [threadsPage([], BOT, "mallory")];
      expect((await run(repo, LANDS)).doc).toMatchObject({ outcome: "refused", notDone: ["pull request #7 was opened by mallory, not by the run's login runner"] });
      expect(writes()).toEqual([]);
    });

    it.each([
      ["open", { status: "in progress" }, "does not read Status: closed"],
      ["empty", { status: "" }, "does not read Status: closed"],
      ["another word", { status: "merged 2026-11-04" }, "does not read Status: closed"],
    ])("refuses a run whose record reads %s, exit 0 and writing nothing: the run is still its own", async (_name, opts, reason) => {
      const { repo } = await seedJob(opts);

      const result = await run(repo, LANDS);

      expect(result.code).toBe(0);
      expect(result.doc).toMatchObject({ outcome: "refused", notDone: [expect.stringContaining(reason)] });
      expect(writes()).toEqual([]);
    });

    it.each([
      ["blocked", { status: "closed 2026-11-04 (blocked: the plan is unclear)" }, "reads (blocked:"],
      ["refused in the record", { extra: "\n## Refused\n\n- the pre-flight refused\n\n## Log\n\n" }, "the record at"],
      ["refused in the morning list", { morning: "# Morning list\n\n## Refused\n\n- pre-flight exited 1\n\n## Decisions\n\nnone\n" }, "the morning list at"],
      ["no PR line", { lines: "Login: runner\n" }, "on a PR: line"],
      ["another pull request's line", { lines: "PR: 8\nLogin: runner\n" }, "on a PR: line"],
      ["no Login line", { lines: "PR: 7\n" }, "names no Login:"],
    ])("holds a run whose record reads %s: exit 0, no merge, and the reason on the status line", async (_name, opts, reason) => {
      const { repo } = await seedJob(opts);

      const result = await run(repo, LANDS);

      expect(result.code).toBe(0);
      expect(result.doc).toMatchObject({ outcome: "refused", notDone: [expect.stringContaining(reason)] });
      expect(writes()).toEqual([PATCHED]);
      expect(lastBody()).toContain(reason);
    });

    it("reads an empty ## Refused section as no row, and the line a later end wrote as the one that stands", async () => {
      const { repo } = await seedJob({ morning: "# Morning list\n\n## Refused\n\nnone\n\n## Decisions\n\n- a row\n", lines: "PR: 6\nLogin: gone\nPR: 7\nLogin: runner\n" });
      expect((await run(repo, LANDS)).doc).toMatchObject({ outcome: "landed" });
    });

    it("reads the record at the head, not the work tree's copy", async () => {
      const { repo } = await seedJob({ status: "in progress" });
      await writeFile(join(repo, RUN_DIR, "record.md"), (await record(repo)).replace("Status: in progress", "Status: closed 2026-11-04"));
      expect((await run(repo, LANDS)).doc).toMatchObject({ outcome: "refused", notDone: [expect.stringContaining("does not read Status: closed")] });
    });

    it("exits 0 naming a running check on the status line, since one outside the watched workflows sends no event, and lands on the next start", async () => {
      const { repo, head } = await seedJob();
      route(`GET repos/o/r/commits/${head}/check-runs`, { total_count: 1, check_runs: [{ id: 1, name: "test", status: "in_progress", conclusion: null, app: { id: 15368 } }] });

      const waiting = await run(repo, LANDS);

      expect(waiting.code).toBe(0);
      expect(waiting.doc).toMatchObject({ outcome: "pending", notDone: [`required check test is still running on ${head}`] });
      expect(writes()).toEqual([PATCHED]);
      expect(lastBody()).toContain(`merge waits on: required check test is still running on ${head}`);

      route(`GET repos/o/r/commits/${head}/check-runs`, { total_count: 1, check_runs: [{ id: 1, name: "test", status: "completed", conclusion: "success", app: { id: 15368 } }] });
      expect((await run(repo, LANDS)).doc).toMatchObject({ outcome: "landed" });
    });

    describe("the review tool, which a cloud run cannot ask (W-2)", () => {
      const LOGIN = "chatgpt-codex-connector[bot]";
      const TOOL = { login: LOGIN, request: "@codex review", clean: "state-comment", stateMarker: "codex-review-state:v1", stateSection: "code_review", waitMinutes: 40, rounds: 2 };
      const JOB_TOOL = `${JSON.stringify({ version: 1, autonomy: { reviewTool: TOOL, landJob: { workflows: ["CI"] } } })}\n`;
      /** The clock {@link fakeClock} starts from, so a comment reads as made when the job started. */
      const STARTED = new Date(1_000_000).toISOString();
      const comment = (id: number, login: string, type: string, body: string): unknown => ({ id, user: { login, type }, body, created_at: STARTED });
      const asked = (id: number, head: string, login = "github-actions[bot]"): unknown => comment(id, login, "Bot", `@codex review\n\n${requestMarker(head)}`);
      const clean = (id: number, head: string): unknown =>
        comment(id, LOGIN, "Bot", `<!-- codex-review-state:v1 ${JSON.stringify({ code_review: { commit_sha: head, has_any_findings: false, has_unresolved_findings: false, status: "completed" } })} -->`);
      const never = (id: number): unknown => ({ databaseId: id, lastEditedAt: null, editor: null });
      const posted = (): string[] => gh.calls.filter((call) => call.method === "POST").map((call) => (call.body as { body: string }).body);

      function answers(reads: unknown[][], reactions: unknown[] = []): void {
        route("POST repos/o/r/issues/7/comments", { id: 900 }, 201);
        route("GET repos/o/r/pulls/7/reviews", []);
        route("GET repos/o/r/issues/7/reactions", reactions);
        gh.routes.set("GET repos/o/r/issues/7/comments", reads.map((json) => ({ status: 200, json })));
        gh.editors = [editorsPage([never(1), never(2), never(3)])];
      }

      it("posts the request itself, once, its own marker counts, and the wait runs out to a hold the status line shows", async () => {
        const { slept } = fakeClock();
        const { repo, head } = await seedJob({ manifest: JOB_TOOL });
        answers([[], [asked(1, head)]]);

        const result = await run(repo, LANDS);

        expect(posted()).toEqual([`@codex review\n\n${requestMarker(head)}`]);
        // Every two minutes: a wait at the verb's 30 s would spend most of GITHUB_TOKEN's hourly allowance.
        expect(new Set(slept)).toEqual(new Set([120_000]));
        expect(result.code).toBe(0);
        expect(result.doc).toMatchObject({ outcome: "refused", evidence: { review: { state: "silent" } }, notDone: [expect.stringContaining("within 40 minutes")] });
        const body = (gh.calls.find((call) => call.method === "PATCH")?.body as { body: string } | undefined)?.body;
        expect(body).toMatch(new RegExp(`merge waits on: ${LOGIN.replace(/[[\]]/g, "\\$&")} gave .* within 40 minutes\\n\\n${MARKER}$`));
        expect(kinds()).not.toContain("merge");
      });

      it("lands on the tool's clean word while it waits, a viewer spelled with [bot] reading the same", async () => {
        fakeClock();
        const { repo, head } = await seedJob({ manifest: JOB_TOOL });
        gh.threads = [threadsPage([], "github-actions[bot]")];
        answers([[], [asked(1, head)], [asked(1, head)], [asked(1, head), clean(2, head)]], [{ user: { login: LOGIN, type: "User" }, content: "+1" }]);

        const result = await run(repo, LANDS);

        expect(result.doc).toMatchObject({ outcome: "landed", evidence: { review: { state: "clean" } } });
        expect(posted()).toHaveLength(1);
      });

      it("stops at once where the request does not post, naming that on the status line, since no marker means the wait can never end", async () => {
        const { slept } = fakeClock();
        const { repo } = await seedJob({ manifest: JOB_TOOL });
        answers([[]]);
        route("POST repos/o/r/issues/7/comments", { message: "Forbidden" }, 403);

        const result = await run(repo, LANDS);

        expect(result.code).toBe(0);
        expect(result.doc).toMatchObject({ outcome: "pending" });
        expect(slept).toEqual([]);
        expect(lastBody()).toContain("the review request was not posted to #7 (HTTP 403)");
      });

      describe("a person who joins a tool's thread (W-1 of the security lens)", () => {
        const BARE = "chatgpt-codex-connector";
        const open = (...authors: [string, string][]): object => ({ ...(thread(false, null, ["Bot", BARE], ...authors) as object), id: "T1" });
        const closedBy = (who: string | null, ...authors: [string, string][]): object => ({ ...(thread(true, who, ["Bot", BARE], ...authors) as object), id: "T1" });
        /** What the status line tells a person to do about a thread GitHub shows as resolved (review/120). */
        const REMEDY = "a person reopens it and closes it";

        async function cleanJob(): Promise<Seeded> {
          const seeded = await seedJob({ manifest: JOB_TOOL });
          answers([[asked(1, seeded.head), clean(2, seeded.head)]], [{ user: { login: LOGIN, type: "User" }, content: "+1" }]);
          return seeded;
        }

        it("stops the land when the re-read after the resolve shows the person's comment, the job's own token having closed it", async () => {
          const { repo } = await cleanJob();
          gh.threads = [threadsPage([open()], BOT), threadsPage([open()], BOT), threadsPage([closedBy(BOT, ["User", "alice"])], BOT)];

          const result = await run(repo, LANDS);

          expect(result.code).toBe(0);
          expect(result.doc).toMatchObject({ outcome: "refused" });
          expect(kinds()).not.toContain("merge");
          expect(lastBody()).toContain("merge waits on: 1 review thread is unresolved");
          expect(lastBody()).toContain("review thread T1");
          expect(lastBody()).toContain(REMEDY);
        });

        it("names the thread and the remedy beside any other stop (review/120)", async () => {
          const { repo } = await cleanJob();
          gh.resolve = { status: 403, json: { message: "Forbidden" } };
          gh.threads = [threadsPage([open()], BOT), threadsPage([open()], BOT), threadsPage([closedBy(BOT, ["User", "alice"])], BOT)];

          await run(repo, LANDS);

          expect(lastBody()).toContain("was not resolved (HTTP 403)");
          expect(lastBody()).toContain(REMEDY);
        });

        it("says the threads did not read, and names nobody, where the re-read after the resolve fails", async () => {
          const { repo } = await cleanJob();
          gh.threads = [threadsPage([open()], BOT), threadsPage([open()], BOT), { errors: [{ message: "Something went wrong" }] }];

          const result = await run(repo, LANDS);

          // This read fails into a decision: it ends as `Held`, leaves `jobFailed` false, and so exits 0 with its status line.
          expect(result.code).toBe(0);
          expect(result.doc).toMatchObject({ outcome: "refused", notDone: ["the review threads could not be read"] });
          expect(kinds()).not.toContain("merge");
          expect(lastBody()).toContain("merge waits on: the review threads could not be read");
          expect(lastBody()).not.toContain("someone else wrote");
        });

        it("stops it whoever closed the thread", async () => {
          const { repo } = await cleanJob();
          gh.threads = [threadsPage([open()], BOT), threadsPage([open()], BOT), threadsPage([closedBy("alice", ["User", "alice"])], BOT)];

          const result = await run(repo, LANDS);

          expect(result.code).toBe(0);
          expect(kinds()).not.toContain("merge");
          expect(lastBody()).toContain("T1");
        });

        it("goes on where only the tool and the run's own login wrote there", async () => {
          const { repo } = await cleanJob();
          gh.threads = [threadsPage([open(["User", "runner"])], BOT), threadsPage([open(["User", "runner"])], BOT), threadsPage([closedBy(BOT, ["User", "runner"])], BOT)];

          expect((await run(repo, LANDS)).doc).toMatchObject({ outcome: "landed" });
        });

        it("does not forget it: a later job, and a session's land, count the thread the job closed over a person", async () => {
          const { repo } = await cleanJob();
          gh.threads = [threadsPage([closedBy(BOT, ["User", "alice"])], BOT)];
          // TEST CHANGE, justified: review/120, GitHub shows this thread resolved, so the count alone left a person nothing to act on.
          const stops = ["1 review thread is unresolved", expect.stringContaining("review thread T1")];
          expect((await run(repo, LANDS)).doc).toMatchObject({ outcome: "refused", notDone: stops });
          expect(lastBody()).toContain(REMEDY);

          const session = await seed({ manifest: JOB_TOOL });
          answers([[asked(1, session.head, "runner"), clean(2, session.head)]], [{ user: { login: LOGIN, type: "User" }, content: "+1" }]);
          gh.threads = [threadsPage([closedBy("github-actions", ["User", "alice"])])];
          expect((await run(session.repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "refused", notDone: stops });
          expect(lastBody()).toContain(REMEDY);
        });

        it("holds the next start where the job's own close reads null, and names the thread (review/119)", async () => {
          const { repo } = await cleanJob();
          gh.threads = [threadsPage([closedBy(null, ["User", "alice"])], BOT)];

          const result = await run(repo, LANDS);

          expect(result.code).toBe(0);
          expect(result.doc).toMatchObject({ outcome: "refused", evidence: { threads: { unresolved: 1 } } });
          expect(kinds()).not.toContain("merge");
          expect(lastBody()).toContain("review thread T1");
          expect(lastBody()).toContain(REMEDY);
        });

        it("reads a null resolver over a thread not read whole as a person's comment", async () => {
          const { repo } = await cleanJob();
          gh.threads = [threadsPage([{ ...closedBy(null), comments: { totalCount: 101, nodes: [{ author: { __typename: "Bot", login: BARE } }] } }], BOT)];

          expect((await run(repo, LANDS)).doc).toMatchObject({ outcome: "refused", evidence: { threads: { unresolved: 1 } } });
          expect(kinds()).not.toContain("merge");
        });

        it("goes on past a null resolver where only the tool and the run's own login wrote there", async () => {
          const { repo } = await cleanJob();
          gh.threads = [threadsPage([closedBy(null, ["User", "runner"])], BOT)];

          expect((await run(repo, LANDS)).doc).toMatchObject({ outcome: "landed" });
        });
      });

      it("counts a marker from the run's login, and asks nothing more", async () => {
        fakeClock();
        const { repo, head } = await seedJob({ manifest: JOB_TOOL });
        answers([[asked(1, head, "runner")]]);

        await run(repo, LANDS);

        expect(posted()).toEqual([]);
      });

      it("counts a marker from whatever login the job's token proves to be", async () => {
        fakeClock();
        const { repo, head } = await seedJob({ manifest: JOB_TOOL });
        gh.threads = [threadsPage([], "stamity-land-app")];
        answers([[asked(1, head, "stamity-land-app[bot]")]]);

        await run(repo, LANDS);

        expect(posted()).toEqual([]);
      });

      it("stops waiting on a draft whose head moved, so the job for the new head does not queue behind a dead wait", async () => {
        const { slept } = fakeClock();
        const { repo, head } = await seedJob({ manifest: JOB_TOOL });
        answers([[asked(1, head)]]);
        const draft = pull(head, { draft: true, mergeable_state: "draft" });
        gh.routes.set("GET repos/o/r/pulls/7", [draft, draft, pull("c".repeat(40), { draft: true, mergeable_state: "draft" })].map((json) => ({ status: 200, json })));

        const result = await run(repo, LANDS);

        expect(result.doc).toMatchObject({ outcome: "refused", notDone: [`pull request #7's head ${"c".repeat(40)} is not HEAD ${head}`] });
        expect(slept).toHaveLength(1);
        expect(writes()).toEqual([]);
      });

      it("counts no one else's marker: a stranger's neither stands for a request nor spends a round", async () => {
        fakeClock();
        const { repo, head } = await seedJob({ manifest: JOB_TOOL });
        const stranger = comment(1, "mallory", "User", requestMarker(head));
        answers([[stranger], [stranger, asked(2, head)]]);

        const result = await run(repo, LANDS);

        expect(posted()).toHaveLength(1);
        expect(result.doc).toMatchObject({ evidence: { review: { state: "silent" } } });
      });

      it("reads the job's marker at a session's land where landJob is on, and not where it is off", async () => {
        const on = await seed({ manifest: JOB_TOOL });
        answers([[asked(1, on.head)]]);
        await run(on.repo, ["land", "--run", RUN]);
        expect(posted()).toEqual([]);

        gh.calls.length = 0;
        const off = await seed({ manifest: `${JSON.stringify({ version: 1, autonomy: { reviewTool: TOOL } })}\n` });
        answers([[asked(1, off.head)]]);
        await run(off.repo, ["land", "--run", RUN]);
        expect(posted()).toHaveLength(1);
      });
    });

    it("leaves an attended run's pull request alone, which no end stamped: a person lands it, and a red job would say nothing new", async () => {
      const { repo } = await seedJob({ mode: "attended", lines: "" });

      const result = await run(repo, LANDS);

      expect(result.code).toBe(0);
      expect(result.doc).toMatchObject({ outcome: "not-a-run" });
      expect(writes()).toEqual([]);
    });

    it("waits out a merge state GitHub has not computed, the one start an event gives", async () => {
      fakeClock();
      const { repo, head } = await seedJob();
      gh.routes.set("GET repos/o/r/pulls/7", [{ status: 200, json: pull(head, { mergeable_state: "unknown" }) }, { status: 200, json: pull(head) }]);
      expect((await run(repo, LANDS)).doc).toMatchObject({ outcome: "landed" });
    });

    it("marks a draft ready once the rest holds, then merges", async () => {
      const { repo, head } = await seedJob();
      route("GET repos/o/r/pulls/7", pull(head, { draft: true, mergeable_state: "draft" }));
      expect((await run(repo, LANDS)).doc).toMatchObject({ outcome: "landed" });
      expect(writes()).toEqual(["ready", "PATCH repos/o/r/pulls/7", "merge"]);
    });

    it("ends already-landed, exit 0, on a pull request merged before it started, whose head branch is gone", async () => {
      const { repo, head } = await seedJob();
      route("GET repos/o/r/pulls/7", pull(head, { state: "closed", merged: true }));
      gh.routes.delete(`GET repos/o/r/branches/${RUN_BRANCH}`);

      const result = await run(repo, LANDS);

      expect(result.code).toBe(0);
      expect(result.doc).toMatchObject({ outcome: "already-landed", pr: { number: 7 } });
      expect(gh.calls.map((call) => call.path)).toEqual(["repos/o/r/pulls/7"]);
    });

    it("exits 0 and touches nothing on a pull request closed unmerged", async () => {
      const { repo, head } = await seedJob();
      route("GET repos/o/r/pulls/7", pull(head, { state: "closed" }));
      expect(await run(repo, LANDS)).toMatchObject({ code: 0, doc: { outcome: "not-a-run" } });
      expect(gh.calls.map((call) => call.path)).toEqual(["repos/o/r/pulls/7"]);
    });

    it("exits 1 for a true failure alone: a read GitHub did not answer", async () => {
      const { repo } = await seedJob();
      route("GET repos/o/r/pulls/7/files", { message: "Bad gateway" }, 502);

      const result = await run(repo, LANDS);

      expect(result.code).toBe(1);
      expect(result.doc).toMatchObject({ outcome: "refused", notDone: [expect.stringContaining("HTTP 502")] });
      expect(writes()).toEqual([]);
    });

    describe("the merge method, read at run time", () => {
      const merged = (): unknown => (gh.calls.find((call) => call.kind === "merge")?.body as { method?: string } | undefined)?.method;
      const rule = (...methods: string[]): unknown => ({ type: "pull_request", parameters: { allowed_merge_methods: methods } });
      const REQUIRED = { type: "required_status_checks", parameters: { required_status_checks: [{ context: "test" }] } };
      const LINEAR = { type: "required_linear_history" };

      it.each([
        ["a ruleset's one method", [rule("squash")], {}, "squash"],
        ["squash before rebase in a ruleset, in the preferred order", [rule("rebase", "squash")], {}, "squash"],
        ["merge first", [rule("rebase", "squash", "merge")], {}, "merge"],
        // TEST CHANGE, justified: review/82, a method must pass both sides, so this row's old pair (a ruleset's one method, the flag
        // off for it) moved to the holds below, and what stands here is the case it hid: a ruleset listing all three over a squash-only repository.
        ["what both allow, a ruleset's three methods over a squash-only repository", [rule("merge", "squash", "rebase")], { allow_merge_commit: false, allow_squash_merge: true, allow_rebase_merge: false }, "squash"],
        ["what both allow, the flags narrowing a ruleset's list to rebase", [rule("merge", "rebase")], { allow_merge_commit: false, allow_squash_merge: true, allow_rebase_merge: true }, "rebase"],
        ["what every ruleset allows, where two apply", [rule("merge", "squash"), rule("squash", "rebase")], {}, "squash"],
        ["the repository's flags with no ruleset's list", [], { allow_merge_commit: false, allow_squash_merge: false, allow_rebase_merge: true }, "rebase"],
        ["squash from the flags before rebase", [], { allow_merge_commit: false, allow_squash_merge: true, allow_rebase_merge: true }, "squash"],
        ["merge where nothing says otherwise", [], {}, "merge"],
        ["squash where a linear-history rule takes merge out, with no flag shown", [LINEAR], {}, "squash"],
        ["squash where a linear-history rule takes merge out, its flag still on", [LINEAR], { allow_merge_commit: true, allow_squash_merge: true, allow_rebase_merge: true }, "squash"],
        ["rebase where a linear-history rule and a ruleset's list leave it alone", [LINEAR, rule("merge", "rebase")], {}, "rebase"],
      ])("takes %s", async (_name, rules, flags, method) => {
        const { repo } = await seedJob();
        route("GET repos/o/r/rules/branches/main", [REQUIRED, ...rules]);
        route("GET repos/o/r", { default_branch: "main", ...flags });

        expect((await run(repo, LANDS)).doc).toMatchObject({ outcome: "landed" });
        expect(merged()).toBe(method);
      });

      it.each([
        ["an empty list in a ruleset", [rule()], {}],
        ["two rulesets with nothing in common", [rule("merge"), rule("rebase")], {}],
        ["every flag off", [], { allow_merge_commit: false, allow_squash_merge: false, allow_rebase_merge: false }],
        ["a ruleset's one method, its flag off", [rule("rebase")], { allow_rebase_merge: false, allow_merge_commit: true }],
        ["a ruleset's list and the flags with nothing in common", [rule("merge", "rebase")], { allow_merge_commit: false, allow_squash_merge: true, allow_rebase_merge: false }],
        ["a linear-history rule over a repository allowing merge commits alone", [LINEAR], { allow_merge_commit: true, allow_squash_merge: false, allow_rebase_merge: false }],
        ["a linear-history rule over a ruleset's list of merge alone", [LINEAR, rule("merge")], {}],
      ])("reads %s as a hold, not a failure", async (_name, rules, flags) => {
        const { repo } = await seedJob();
        route("GET repos/o/r/rules/branches/main", [REQUIRED, ...rules]);
        route("GET repos/o/r", { default_branch: "main", ...flags });

        const result = await run(repo, LANDS);

        expect(result.code).toBe(0);
        expect(kinds()).not.toContain("merge");
        expect(lastBody()).toContain("merge waits on: no merge method");
      });
    });

    it("reads the land job's own failed run on the tip as no red, by name, and still reads any other", async () => {
      const { repo, base } = await seedJob();
      route("GET repos/o/r/rules/branches/main", []);
      const failed = (name: string): unknown => ({ total_count: 1, check_runs: [{ id: 2, name, status: "completed", conclusion: "failure", app: { id: 15368 } }] });

      route(`GET repos/o/r/commits/${base}/check-runs`, failed(LAND_JOB_NAME));
      expect((await run(repo, [...LANDS, "--dry-run"])).doc).toMatchObject({ outcome: "would-land", evidence: { defaultBranch: { failing: [] } } });

      route(`GET repos/o/r/commits/${base}/check-runs`, failed("build"));
      expect((await run(repo, LANDS)).doc).toMatchObject({ outcome: "asks", evidence: { defaultBranch: { failing: ["build"] } } });
    });

    it("exits 0 and touches nothing on a pull request no run opened", async () => {
      const { repo, head } = await seedJob();
      route("GET repos/o/r/pulls/7", pull(head, { body: "A person's change." }));

      const result = await run(repo, LANDS);

      expect(result.code).toBe(0);
      expect(result.doc).toMatchObject({ outcome: "not-a-run", pr: { number: 7 } });
      expect(gh.calls.map((call) => call.path)).toEqual(["repos/o/r/pulls/7"]);
    });

    // REQ-FLOW-168: Claude's cloud added "Generated by Claude Code" after the marker on 2026-11-06, and the job answered
    // not-a-run. The run is now found before that footer, and the body it writes ends with the one marker again.
    it("lands a run whose client added a footer after the marker, and writes the body with one marker, last", async () => {
      const { repo, head } = await seedJob();
      route("GET repos/o/r/pulls/7", pull(head, { body: `The list.\n\n${MARKER}\n\nGenerated by [Claude Code](https://claude.ai/code)\n` }));

      const result = await run(repo, LANDS);

      expect(result.doc).toMatchObject({ outcome: "landed", pr: { number: 7 } });
      const body = lastBody() ?? "";
      expect(body).toMatch(new RegExp(`^The list\\.\\n\\nevidence checked at \\S+ for ${head}: [^\\n]+\\n\\n${MARKER}$`));
      expect(body.split(MARKER)).toHaveLength(2);
    });

    // REQ-FLOW-168, amended 2026-11-10: Claude's web cloud wrote a rule line and an emphasised generator line after the
    // marker in a real run, and the job answered not-a-run. The run is now found before that footer too.
    it("lands a run whose body ends in Claude's web footer, a rule line and an emphasised generator line", async () => {
      const { repo, head } = await seedJob();
      const footer = "---\n_Generated by [Claude Code](https://claude.ai/code/session_01GPSuhyX3k1SdW3wb9wrvKv)_";
      route("GET repos/o/r/pulls/7", pull(head, { body: `The list.\n\n${MARKER}\n\n${footer}` }));

      const result = await run(repo, LANDS);

      expect(result.doc).toMatchObject({ outcome: "landed", pr: { number: 7 } });
      const body = lastBody() ?? "";
      expect(body).toMatch(new RegExp(`^The list\\.\\n\\nevidence checked at \\S+ for ${head}: [^\\n]+\\n\\n${MARKER}$`));
      expect(body.split(MARKER)).toHaveLength(2);
    });

    it("exits 0 and touches nothing where a heading follows the run's marker", async () => {
      const { repo, head } = await seedJob();
      route("GET repos/o/r/pulls/7", pull(head, { body: `The list.\n\n${MARKER}\n\n## A person's notes` }));

      const result = await run(repo, LANDS);

      expect(result.code).toBe(0);
      expect(result.doc).toMatchObject({ outcome: "not-a-run", pr: { number: 7 } });
      expect(gh.calls.map((call) => call.path)).toEqual(["repos/o/r/pulls/7"]);
    });

    it("refuses a fork's pull request by the same check the run's own land reads", async () => {
      const { repo, head } = await seedJob();
      route("GET repos/o/r/pulls/7", pull(head, { head: { ref: RUN_BRANCH, sha: head, repo: { full_name: "someone/r" } } }));
      expect((await run(repo, LANDS)).doc).toMatchObject({ outcome: "refused", notDone: ["pull request #7 comes from a fork, not o/r"] });
      expect(writes()).toEqual([]);
    });

    it("refuses where a leg of the setting is off, so a head cannot turn the job on for itself", async () => {
      const { repo } = await seedJob();
      route("GET repos/o/r/contents/.stamity/manifest.json", { content: Buffer.from('{"version":1}\n').toString("base64") });

      const result = await run(repo, LANDS);

      expect(result.code).toBe(0);
      expect(result.doc).toMatchObject({ outcome: "refused", notDone: [expect.stringContaining("autonomy.landJob is not on in every leg")] });
      expect(writes()).toEqual([PATCHED]);
    });

    it("stops at an ask: no approval reaches a job, so the person's act stays the person's", async () => {
      const { repo } = await seedJob();
      route("GET repos/o/r/pulls/7/files", [{ filename: "a.txt" }, { filename: ".github/workflows/ci.yml" }, { filename: "b" }]);

      const result = await run(repo, LANDS);

      expect(result.code).toBe(0);
      expect(result.doc).toMatchObject({ outcome: "asks" });
      expect(writes()).toEqual([PATCHED]);
      expect(lastBody()).toContain("(a person decides: pr-merge)");
    });

    it("leaves the pull request open when a head pushed meanwhile fails the merge on its sha (409)", async () => {
      const { repo } = await seedJob();
      const before = await record(repo);
      gh.merge = { status: 409, json: { message: "Head branch was modified" } };

      const result = await run(repo, LANDS);

      expect(result.code).toBe(0);
      expect(result.doc).toMatchObject({ outcome: "refused", notDone: [expect.stringContaining("HTTP 409")] });
      expect(await record(repo)).toBe(before);
      // The new head's own job speaks for it: this one adds no line over the evidence it wrote.
      expect(lastBody()).toContain("evidence checked at");
    });

    // REQ-FLOW-157 (1.19.1): GitHub does not apply a body's Closes line to a merge the job's token makes, so the job closes
    // the run's issue itself after its merge, and only one every check names as the run's; else the land stands, and
    // the reason is on Not done: and in one comment on the pull request.
    describe("the run's issue after the job's merge", () => {
      const ISSUE = "repos/o/r/issues/12";
      const READY = { name: "stamity:ready" };
      const GREEN_RUNS = { total_count: 1, check_runs: [{ id: 1, name: "test", status: "completed", conclusion: "success", app: { id: 15368 } }] };
      const contractOf = (item: string): string =>
        ["run-contract: 1", `item: "${item}"`, "base: 02e040eb", "acceptance: done", "scope: { in: [src] }", 'answerer: "@maintainer"', ""].join("\n");
      const issueJson = (over: Record<string, unknown> = {}): Record<string, unknown> => ({ number: 12, state: "open", labels: [READY], ...over });
      /** The close as the stand-in keeps it: the fixed-purpose call, at the path the runner's own builder made. */
      const CLOSED = `close ${ISSUE}`;
      /**
       * Every read or write of an issue itself, in any repository: a comment on the pull request is not one.
       * TEST CHANGE, justified (REQ-FLOW-157, a2-land-closes-issue): the close is the fixed-purpose call (`close <path>`),
       * not a `ghApi` PATCH the real door refuses; a close tried any way, the fixed call, a PATCH or a refused write to an
       * issue, still counts, so no case that pins no close reads fewer calls than before.
       */
      const issueCalls = (): string[] =>
        kinds().filter((kind) => /^(?:GET |PATCH |close |refused (?:POST|PATCH) )repos\/[^/]+\/[^/]+\/issues\/\d+$/.test(kind) || kind === "refused close");
      const issuePatches = (): string[] => issueCalls().filter((kind) => !kind.startsWith("GET "));
      /** The one close call the verb made, its request as passed. */
      const closeCall = () => gh.calls.find((call) => call.kind.startsWith("close "));
      const comments = () => gh.calls.filter((call) => call.method === "POST" && call.path === "repos/o/r/issues/7/comments");
      const staysOpen = (reason: string): string => `the run's issue o/r#12 stays open: ${reason}`;
      const commentFor = (reason: string): string => `The land job merged this pull request, and the run's issue o/r#12 stays open: ${reason}. Close it by hand.\n\n${MARKER}`;
      const NO_RIGHT = "closing it answered HTTP 403, so the land workflow's token may lack issues: write; run stamity sync to write it, then close the issue by hand";

      /**
       * The seeded run with a `contract.yml` naming `item` committed at the head, the body's Closes line naming `closes`, and
       * GitHub answering for an open issue #12 labelled `stamity:ready`, its close and the comment.
       */
      async function withIssue(seeded: Seeded, item = "o/r#12", closes = "o/r#12"): Promise<Seeded> {
        const { repo, remote } = seeded;
        await put(repo, `${RUN_DIR}/contract.yml`, contractOf(item));
        git(repo, ["add", "-A"]);
        git(repo, ["commit", "-q", "-m", "contract"]);
        git(repo, ["push", "-q", remote, `HEAD:refs/heads/${RUN_BRANCH}`]);
        const head = git(repo, ["rev-parse", "HEAD"]);
        route("GET repos/o/r/pulls/7", pull(head, { body: `The list.\n\nCloses ${closes}\n\n${MARKER}` }));
        route(`GET repos/o/r/commits/${head}/check-runs`, GREEN_RUNS);
        route(`GET repos/o/r/branches/${RUN_BRANCH}`, { commit: { sha: head } });
        route(`GET ${ISSUE}`, issueJson());
        route(`PATCH ${ISSUE}`, { number: 12, state: "closed" });
        route("POST repos/o/r/issues/7/comments", { id: 901 }, 201);
        return { ...seeded, head };
      }

      it("closes the issue the contract and the Closes line name, open and labelled stamity:ready, only after the merge answered", async () => {
        const { repo } = await withIssue(await seedJob());

        const result = await run(repo, LANDS);

        expect(result.code).toBe(0);
        expect(result.doc).toMatchObject({ outcome: "landed", issue: { ref: "o/r#12", closed: true }, notDone: [] });
        // TEST CHANGE, justified (REQ-FLOW-157, a2-land-closes-issue): the close is the fixed-purpose call, its path built by
        // the runner's real ghCloseIssueArgs, not a ghApi PATCH, which the real door refuses before gh starts.
        expect(writes()).toEqual([PATCHED, "merge", CLOSED]);
        // The issue's read too comes after the merge: nothing about the issue happens before the merge call answered 200.
        const order = kinds();
        expect(order.indexOf(`GET ${ISSUE}`)).toBeGreaterThan(order.indexOf("merge"));
        expect(order.indexOf(CLOSED)).toBeGreaterThan(order.indexOf(`GET ${ISSUE}`));
        // TEST CHANGE, justified (REQ-FLOW-157, a2-land-closes-issue): the verb hands the close only the issue's parts; its
        // body is the runner's one constant, { state: "closed", state_reason: "completed" }, pinned in ghRunner.test.ts.
        expect(closeCall()?.body).toEqual({ hostname: "github.com", owner: "o", repo: "r", number: 12 });
        // The label stays on: the close sends nothing but the state.
        expect(comments()).toEqual([]);

        const text = await runInProcess([runCommand], ["run", ...LANDS], { cwd: repo });
        expect(text.stdout).toContain("issue: closed o/r#12\n");
      });

      // The stand-in's own pin: a close sent through ghApi is refused here as the real door refuses it, before gh starts,
      // so no case below can pass on a close that a real job would never send.
      it("refuses a close sent through ghApi, as the real door does, and keeps it as refused", async () => {
        await expect(ghApi({ method: "PATCH", path: ISSUE, body: { state: "closed", state_reason: "completed" }, hostname: "github.com" })).rejects.toMatchObject({ code: "GH_REFUSED" });
        expect(kinds()).toEqual([`refused PATCH ${ISSUE}`]);
        expect(issuePatches()).toEqual([`refused PATCH ${ISSUE}`]);
      });

      it("keeps the land when the close is refused, naming the right the token may lack in Not done: and in one comment", async () => {
        const { repo } = await withIssue(await seedJob());
        route(`PATCH ${ISSUE}`, { message: "Resource not accessible by integration" }, 403);

        const result = await run(repo, LANDS);

        expect(result.code).toBe(0);
        expect(result.doc).toMatchObject({ outcome: "landed", issue: { ref: "o/r#12", closed: false, reason: expect.stringContaining("HTTP 403") }, notDone: [staysOpen(NO_RIGHT)] });
        expect(comments().map((call) => (call.body as { body: string }).body)).toEqual([commentFor(NO_RIGHT)]);
        // TEST CHANGE, justified (REQ-FLOW-157, a2-land-closes-issue): the refused close is the fixed-purpose call answering
        // 403, not a ghApi PATCH, which the real door refuses before gh starts and so before GitHub could answer at all.
        expect(writes()).toEqual([PATCHED, "merge", CLOSED, "POST repos/o/r/issues/7/comments"]);
      });

      it("writes nothing to an issue already closed, and says so", async () => {
        const { repo } = await withIssue(await seedJob());
        route(`GET ${ISSUE}`, issueJson({ state: "closed" }));

        const result = await run(repo, LANDS);

        expect(result.code).toBe(0);
        expect(result.doc).toMatchObject({ outcome: "landed", issue: { ref: "o/r#12" }, notDone: [] });
        expect(issuePatches()).toEqual([]);
        expect(comments()).toEqual([]);

        const text = await runInProcess([runCommand], ["run", ...LANDS], { cwd: repo });
        expect(text.stdout).toContain("issue: o/r#12 was already closed\n");
      });

      it("reads and closes no issue where the contract's item is in another repository, a Closes line naming it in the body", async () => {
        const { repo } = await withIssue(await seedJob(), "x/y#3", "x/y#3");
        // Both answer as an issue every other check passes, so only the repository check stops a close.
        route("GET repos/x/y/issues/3", issueJson({ number: 3 }));
        route("GET repos/o/r/issues/3", issueJson({ number: 3 }));

        const result = await run(repo, LANDS);

        expect(result.code).toBe(0);
        expect(result.doc).toMatchObject({ outcome: "landed" });
        expect(issueCalls()).toEqual([]);
      });

      it("leaves the issue open where the body's Closes line names another issue", async () => {
        const { repo } = await withIssue(await seedJob(), "o/r#12", "o/r#13");
        // #13 answers as an issue every other check passes, so a close by the body's own number would show.
        route("GET repos/o/r/issues/13", issueJson({ number: 13 }));
        route("PATCH repos/o/r/issues/13", { number: 13, state: "closed" });

        const result = await run(repo, LANDS);

        expect(result.code).toBe(0);
        expect(result.doc).toMatchObject({ outcome: "landed", issue: { ref: "o/r#12", closed: false }, notDone: [staysOpen("the body's Closes line does not name it")] });
        expect(issuePatches()).toEqual([]);
        expect(comments().map((call) => (call.body as { body: string }).body)).toEqual([commentFor("the body's Closes line does not name it")]);
      });

      it("leaves it open where GitHub answers the number as a pull request", async () => {
        const { repo } = await withIssue(await seedJob());
        route(`GET ${ISSUE}`, issueJson({ pull_request: { url: "https://api.github.com/repos/o/r/pulls/12" } }));

        const result = await run(repo, LANDS);

        expect(result.code).toBe(0);
        expect(result.doc).toMatchObject({ outcome: "landed", issue: { ref: "o/r#12", closed: false }, notDone: [staysOpen("it is a pull request")] });
        expect(issuePatches()).toEqual([]);
        expect(comments()).toHaveLength(1);
      });

      it("leaves it open where the issue no longer carries stamity:ready", async () => {
        const { repo } = await withIssue(await seedJob());
        route(`GET ${ISSUE}`, issueJson({ labels: [{ name: "bug" }] }));

        const result = await run(repo, LANDS);

        expect(result.code).toBe(0);
        expect(result.doc).toMatchObject({ outcome: "landed", issue: { ref: "o/r#12", closed: false }, notDone: [staysOpen("it no longer carries stamity:ready")] });
        expect(issuePatches()).toEqual([]);
        expect(comments()).toHaveLength(1);
      });

      // edgeCases: any status other than 200 on the read leaves the issue open, whatever the status.
      it("leaves it open where the issue's read answers other than 200", async () => {
        const { repo } = await withIssue(await seedJob());
        route(`GET ${ISSUE}`, { message: "Not Found" }, 404);

        const result = await run(repo, LANDS);

        expect(result.code).toBe(0);
        expect(result.doc).toMatchObject({ outcome: "landed", issue: { ref: "o/r#12", closed: false }, notDone: [staysOpen("its read answered HTTP 404")] });
        expect(issuePatches()).toEqual([]);
        expect(comments()).toHaveLength(1);
      });

      it("touches no issue where the merge answers 409", async () => {
        const { repo } = await withIssue(await seedJob());
        gh.merge = { status: 409, json: { message: "Head branch was modified" } };

        const result = await run(repo, LANDS);

        expect(result.doc).toMatchObject({ outcome: "refused" });
        expect(result.doc).not.toHaveProperty("issue");
        expect(issueCalls()).toEqual([]);
        expect(comments()).toEqual([]);
      });

      it("touches no issue at a session's land, whose merge GitHub applies the Closes line to", async () => {
        const { repo } = await withIssue(await seed());

        const result = await run(repo, ["land", "--run", RUN]);

        expect(result.code).toBe(0);
        expect(result.doc).toMatchObject({ outcome: "landed" });
        expect(result.doc).not.toHaveProperty("issue");
        expect(issueCalls()).toEqual([]);
        expect(comments()).toEqual([]);
      });

      // Signed off (1.19.1): a body written with CRLF line ends still carries the Closes line the job closes on.
      it("closes the issue where the body's lines end in CRLF", async () => {
        const { repo, head } = await withIssue(await seedJob());
        route("GET repos/o/r/pulls/7", pull(head, { body: `The list.\r\n\r\nCloses o/r#12\r\n\r\n${MARKER}` }));

        const result = await run(repo, LANDS);

        expect(result.code).toBe(0);
        expect(result.doc).toMatchObject({ outcome: "landed", issue: { ref: "o/r#12", closed: true }, notDone: [] });
        // TEST CHANGE, justified (REQ-FLOW-157, a2-land-closes-issue): the close is the fixed-purpose call, not a ghApi PATCH.
        expect(issuePatches()).toEqual([CLOSED]);
        expect(comments()).toEqual([]);
      });

      // Signed off (1.19.1): an item in another repository is left open with its own reason: no issue call, one Not done:
      // line, and the one comment on the pull request.
      it("leaves an item in another repository open with its own reason, in Not done: and in one comment", async () => {
        const { repo } = await withIssue(await seedJob(), "x/y#3", "x/y#3");
        // Both answer as an issue every other check passes, so a read or a close of either would show.
        route("GET repos/x/y/issues/3", issueJson({ number: 3 }));
        route("GET repos/o/r/issues/3", issueJson({ number: 3 }));
        const reason = "it is in another repository";

        const result = await run(repo, LANDS);

        expect(result.code).toBe(0);
        expect(result.doc).toMatchObject({ outcome: "landed", issue: { ref: "x/y#3", closed: false, reason }, notDone: [`the run's issue x/y#3 stays open: ${reason}`] });
        expect(issueCalls()).toEqual([]);
        expect(comments().map((call) => (call.body as { body: string }).body)).toEqual([
          `The land job merged this pull request, and the run's issue x/y#3 stays open: ${reason}. Close it by hand.\n\n${MARKER}`,
        ]);
      });

      // Signed off (1.19.1): a failure at the issue's read, its close or the comment after the merge never moves the
      // outcome or the exit code; its Not done: line names the failure's class, never its message, which may hold a path.
      describe("a failure after the merge", () => {
        const MACHINE_PATH = "/home/runner/work/_tool/gh/bin/gh";
        const MESSAGE = `spawn ${MACHINE_PATH} ENOENT`;
        const COMMENTS = "POST repos/o/r/issues/7/comments";
        // The close's route is the method and path of the vector the real ghCloseIssueArgs built, which the stand-in answers from.
        const STEPS = { read: `GET ${ISSUE}`, close: `PATCH ${ISSUE}`, comment: COMMENTS } as const;
        /**
         * An answer that rejects as `gh` does when it fails to start: a code, and a message naming the machine's path.
         * Mock reason: the stand-in's `failing` set rejects with one fixed message that names no path, and this case is
         * about a message that does; a rejected promise as the route makes the stand-in's own `Promise.resolve` hand it back.
         */
        const spawnFailure = (): Answer => {
          const failed = Promise.reject(Object.assign(new Error(MESSAGE), { code: "ENOENT" }));
          // Marked handled here, so the suite reports no stray rejection; the verb's own await still rejects with it.
          failed.catch(() => undefined);
          return failed as unknown as Answer;
        };
        /** A `/` that starts a word: the mark of an absolute path in a line. */
        const ABSOLUTE = /(?:^|[\s("'])\/[^\s/]/;

        it.each([
          ["the read", "thrown", "read", "ENOENT"],
          ["the read", "non-200", "read", "HTTP 500"],
          ["the close", "thrown", "close", "ENOENT"],
          ["the close", "non-200", "close", "HTTP 500"],
          ["the comment", "thrown", "comment", "ENOENT"],
          ["the comment", "non-200", "comment", "HTTP 500"],
        ] as const)("keeps the land and exit 0 where %s fails (%s), naming its class and no path", async (_name, how, step, failureClass) => {
          const { repo } = await withIssue(await seedJob());
          // The comment posts only where the issue is left open, so that step's case leaves it open on the label first.
          if (step === "comment") route(`GET ${ISSUE}`, issueJson({ labels: [{ name: "bug" }] }));
          if (how === "thrown") gh.routes.set(STEPS[step], spawnFailure());
          else route(STEPS[step], { message: "Server Error" }, 500);

          const result = await run(repo, LANDS);

          expect(result.code).toBe(0);
          expect(result.doc).toMatchObject({ outcome: "landed", issue: { ref: "o/r#12", closed: false } });
          const notDone = (result.doc as { notDone: string[] }).notDone;
          // The issue's own line where the read or the close failed; for the comment, the label's line and the comment's.
          expect(notDone).toHaveLength(step === "comment" ? 2 : 1);
          const failed = notDone.at(-1) ?? "";
          expect(failed).toContain(failureClass);
          expect(failed).toContain(step === "comment" ? "was not posted to #7" : "the run's issue o/r#12 stays open: ");
          for (const line of notDone) {
            expect(line).not.toContain(MESSAGE);
            expect(line).not.toContain(MACHINE_PATH);
            expect(line).not.toMatch(ABSOLUTE);
          }
          expect(JSON.stringify(result.doc)).not.toContain(MACHINE_PATH);
          // The close was never sent where the read failed, and the comment was asked for every time the issue stayed open.
          if (step === "read") expect(issuePatches()).toEqual([]);
          // TEST CHANGE, justified (REQ-FLOW-157, a2-land-closes-issue): where the close fails, it failed as the fixed-purpose
          // call GitHub was asked, not as a ghApi PATCH the real door refuses before gh starts.
          if (step === "close") expect(issuePatches()).toEqual([CLOSED]);
          expect(comments()).toHaveLength(1);
        });
      });
    });

    it("holds on the status line when GitHub refuses the merge, and fails only where GitHub itself failed", async () => {
      const { repo } = await seedJob();
      gh.merge = { status: 405, json: { message: "Pull Request is not mergeable" } };
      const refused = await run(repo, LANDS);
      expect(refused.code).toBe(0);
      expect(lastBody()).toContain("merge waits on: GitHub refused the merge (HTTP 405)");

      gh.merge = { status: 503, json: { message: "Unavailable" } };
      expect((await run(repo, LANDS)).code).toBe(1);
    });

    describe("what the setting stops, in a job and out of it", () => {
      const TOP_READ = "GET repos/o/r/contents/.stamity/manifest.json";
      const OTHER = "apps/api/.stamity/manifest.json";
      const OTHER_READ = `GET repos/o/r/contents/${OTHER}`;
      const NO_TOP = "main holds no .stamity/manifest.json at the repository's top, so nothing a run cannot write binds this land: a person places one there first";
      const JOB_OFF = "autonomy.landJob is not on in every leg of the setting, so the job does not land here";
      const FILES_READ = "GET repos/o/r/pulls/7/files";
      const onGitHub = (text: string): Record<string, string> => ({ content: Buffer.from(text).toString("base64"), encoding: "base64" });
      const SESSION = ["land", "--run", RUN];
      /** Each way in, what starts it, and the exit a stop gives there: a hold in a job, a refusal in a session. */
      const WAYS_IN = [
        ["a job", (files: Record<string, string>) => seedJob({ files }), LANDS, 0],
        ["a session", (files: Record<string, string>) => seed({ manifest: LAND_ON, files }), SESSION, 1],
      ] as [string, (files: Record<string, string>) => Promise<Seeded>, string[], number][];

      it.each(WAYS_IN)("stops %s where the default branch holds no manifest at the top", async (_way, arrange, args, code) => {
        const { repo } = await arrange({});
        route(TOP_READ, { message: "Not Found" }, 404);

        const result = await run(repo, args);

        expect(result).toMatchObject({ code, doc: { outcome: "refused", notDone: [NO_TOP] } });
        expect(kinds()).not.toContain("merge");
      });

      it("puts that stop on a job's status line", async () => {
        const { repo } = await seedJob();
        route(TOP_READ, { message: "Not Found" }, 404);

        await run(repo, LANDS);

        expect(writes()).toEqual([PATCHED]);
        expect(lastBody()).toContain("merge waits on: main holds no .stamity/manifest.json");
      });

      it("holds a job with the key off ahead of the reads that can fail", async () => {
        const { repo } = await seedJob();
        route(TOP_READ, onGitHub('{"version":1}\n'));
        route(FILES_READ, { message: "Bad gateway" }, 502);

        expect(await run(repo, LANDS)).toMatchObject({ code: 0, doc: { outcome: "refused", notDone: [JOB_OFF] } });
        expect(kinds()).not.toContain(FILES_READ);
      });

      it("leaves a session with the key off to meet that failed read, the key binding only a job", async () => {
        const { repo } = await seed({ manifest: LAND_ON });
        route(TOP_READ, onGitHub('{"version":1}\n'));
        route(FILES_READ, { message: "Bad gateway" }, 502);

        expect(await run(repo, SESSION)).toMatchObject({ code: 1, doc: { outcome: "refused", notDone: ["the changed files read answered HTTP 502"] } });
      });

      it.each(WAYS_IN)("stops %s on a setup elsewhere whose read GitHub answers with a failure", async (_way, arrange, args, code) => {
        const { repo } = await arrange({ [OTHER]: LAND_ON });
        route(OTHER_READ, { message: "Bad gateway" }, 502);

        const result = await run(repo, args);

        expect(result).toMatchObject({ code, doc: { outcome: "refused", notDone: ["the default branch's manifest read answered HTTP 502"] } });
        expect(kinds()).not.toContain("merge");
      });

      it.each(WAYS_IN)("stops %s on a setup elsewhere whose read GitHub never answers", async (_way, arrange, args, code) => {
        const { repo } = await arrange({ [OTHER]: LAND_ON });
        gh.failing.add(OTHER_READ);

        const result = await run(repo, args);

        expect(result).toMatchObject({ code, doc: { outcome: "refused", notDone: [expect.stringContaining("a read failed before GitHub answered")] } });
        expect(kinds()).not.toContain("merge");
      });

      const ELSEWHERE_JOB = '{"version":1,"autonomy":{"landJob":{"workflows":["Elsewhere"]}}}\n';

      it("holds a job on a setup elsewhere that names another land job, once the list is read", async () => {
        const { repo } = await seedJob({ files: { [OTHER]: ELSEWHERE_JOB } });
        route(OTHER_READ, onGitHub(ELSEWHERE_JOB));

        expect(await run(repo, LANDS)).toMatchObject({ code: 0, doc: { outcome: "refused", notDone: [JOB_OFF] } });
        expect(kinds()).toContain(FILES_READ);
        expect(kinds()).not.toContain("merge");
      });

      it("lands a session past that setup, the key binding only a job", async () => {
        const { repo } = await seed({ manifest: LAND_ON, files: { [OTHER]: ELSEWHERE_JOB } });
        route(OTHER_READ, onGitHub(ELSEWHERE_JOB));

        expect(await run(repo, SESSION)).toMatchObject({ code: 0, doc: { outcome: "landed" } });
      });

      it.each(WAYS_IN)("asks in %s where a setup elsewhere names the default branch as deploying", async (_way, arrange, args, code) => {
        const named = `${JSON.stringify({ version: 1, autonomy: { deployingBranches: ["main"], landJob: { workflows: ["CI"] } } })}\n`;
        const { repo } = await arrange({ [OTHER]: named });
        route(OTHER_READ, onGitHub(named));

        expect(await run(repo, args)).toMatchObject({ code, doc: { outcome: "asks", asks: { reasons: ["main is named in autonomy.deployingBranches"] } } });
        expect(kinds()).not.toContain("merge");
      });
    });

    describe("a hold whose status line does not write (review/121)", () => {
      const WRITES = [
        ["answers a refusal", () => route(PATCHED, { message: "Forbidden" }, 403), "HTTP 403"],
        ["answers a failure", () => route(PATCHED, { message: "Bad gateway" }, 502), "HTTP 502"],
        ["fails before GitHub answers", () => gh.failing.add(PATCHED), "gh failed before GitHub answered"],
      ] as [string, () => void, string][];

      it.each(WRITES)("exits 1 where the write %s, since a green job and no line would hide the hold", async (_name, arrange, words) => {
        const { repo } = await seedJob();
        gh.threads = [threadsPage([thread(true, "runner", ["User", "alice"])], BOT)];
        arrange();

        const result = await run(repo, LANDS);

        expect(result.code).toBe(1);
        expect(result.doc).toMatchObject({ outcome: "refused", notDone: ["1 review thread is unresolved", `why the merge waits was not written into #7's body (${words})`] });
        expect(kinds()).not.toContain("merge");
      });

      it("exits 1 on a hold the run's own record makes", async () => {
        const { repo } = await seedJob({ status: "closed 2026-11-04 (blocked: the plan is unclear)" });
        gh.failing.add(PATCHED);
        expect((await run(repo, LANDS)).code).toBe(1);
      });

      it("exits 1 on a pending job, which no later event may follow", async () => {
        const { repo, head } = await seedJob();
        route(`GET repos/o/r/commits/${head}/check-runs`, { total_count: 1, check_runs: [{ id: 1, name: "test", status: "in_progress", conclusion: null, app: { id: 15368 } }] });
        gh.failing.add(PATCHED);
        expect(await run(repo, LANDS)).toMatchObject({ code: 1, doc: { outcome: "pending" } });
      });

      it("exits 1 on an ask, which no approval reaches in a job", async () => {
        const { repo } = await seedJob();
        route("GET repos/o/r/pulls/7/files", [{ filename: "a.txt" }, { filename: ".github/workflows/ci.yml" }, { filename: "b" }]);
        gh.failing.add(PATCHED);
        expect(await run(repo, LANDS)).toMatchObject({ code: 1, doc: { outcome: "asks" } });
      });
    });

    it("refuses at the command line: an approval, a run, a wait and a fast-forward are a session's", async () => {
      const { repo } = await seedJob();
      const sha = "a".repeat(40);
      for (const argv of [
        ["land", "--job", "--pr", "7", "--approved", sha],
        ["land", "--job", "--pr", "7", "--run", RUN],
        ["land", "--job", "--pr", "7", "--wait", "1"],
        ["land", "--job", "--pr", "7", "--fast-forward"],
        ["land", "--job", "--pr", "7", "--method", "squash"],
        ["land", "--job"],
        ["land", "--job", "--pr"],
        ["land", "--job", "--pr", "seven"],
        ["land", "--run", RUN, "--pr", "7"],
        ["checkpoint", "--run", RUN, "--pr", "7", "--title", "t"],
      ]) {
        // oxlint-disable-next-line no-await-in-loop -- the cases share one repository and the process environment the runner stubs
        expect((await run(repo, argv)).code, argv.join(" ")).toBe(2);
      }
      expect(gh.calls).toEqual([]);
    });
  });
});
