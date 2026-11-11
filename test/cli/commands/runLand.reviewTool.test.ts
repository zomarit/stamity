// The harness comes first: its module mocks must be in place before any module below loads one they stand in for.
import { editorsPage, gh, landHarness, RUN, RUN_BRANCH, thread, threadsPage } from "./runLand.harness.ts";
import type { Seeded } from "./runLand.harness.ts";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runCommand } from "../../../src/cli/commands/run.ts";
import { requestMarker } from "../../../src/runs/reviewTool.ts";
import { runInProcess } from "../../support/inProcess.ts";

/** `stamity run land`: the review tool and its own threads. The set-up, the stand-ins and why each one is mocked are in `./runLand.harness.ts`. */

describe("stamity run land", () => {
  const { fakeClock, seed, pull, route, run, kinds } = landHarness();

  describe("the review tool (REQ-FLOW-154)", () => {
    const LOGIN = "chatgpt-codex-connector[bot]";
    const TOOL = { login: LOGIN, request: "@codex review", clean: "state-comment", stateMarker: "codex-review-state:v1", stateSection: "code_review", waitMinutes: 40, rounds: 2 };
    const block = (sha: string, status = "completed", findings = false): string =>
      `<!-- codex-review-state:v1 ${JSON.stringify({ code_review: { commit_sha: sha, has_any_findings: findings, has_unresolved_findings: findings, status } })} -->`;
    const minutesAgo = (minutes: number): string => new Date(Date.now() - minutes * 60_000).toISOString();
    const comment = (id: number, login: string, type: string, body: string, createdAt = minutesAgo(5)): unknown => ({ id, user: { login, type }, body, created_at: createdAt });
    const fromRun = (id: number, head: string, createdAt?: string): unknown => comment(id, "runner", "User", `@codex review\n\n${requestMarker(head)}`, createdAt);
    const fromTool = (id: number, body: string): unknown => comment(id, LOGIN, "Bot", body);
    const never = (id: number): unknown => ({ databaseId: id, lastEditedAt: null, editor: null });
    const editedBy = (id: number, type: string, login: string): unknown => ({ databaseId: id, lastEditedAt: minutesAgo(1), editor: { __typename: type, login } });
    // The bot's real `+1` reads `User` in REST: the type is no filter, the login is.
    const plusOne = { user: { login: LOGIN, type: "User" }, content: "+1" };

    const seedTool = async (tool: Record<string, unknown> = TOOL): Promise<Seeded> => {
      const manifest = `${JSON.stringify({ version: 1, autonomy: { reviewTool: tool } })}\n`;
      const seeded = await seed({ manifest });
      route("GET repos/o/r/contents/.stamity/manifest.json", { content: Buffer.from(manifest).toString("base64"), encoding: "base64" });
      route("POST repos/o/r/issues/7/comments", { id: 900 }, 201);
      return seeded;
    };
    /** The three REST reads, and the editors as the tool's own edit reads: GraphQL's bare name on a `Bot`. */
    const answers = (comments: unknown[], reactions: unknown[] = [plusOne], reviews: unknown[] = []): void => {
      route("GET repos/o/r/issues/7/comments", comments);
      route("GET repos/o/r/issues/7/reactions", reactions);
      route("GET repos/o/r/pulls/7/reviews", reviews);
    };
    const posted = (): string[] => gh.calls.filter((call) => call.method === "POST").map((call) => (call.body as { body: string }).body);

    it("reads no comment, posts nothing and asks no editor with no review tool set", async () => {
      const { repo } = await seed();

      expect((await run(repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "landed", evidence: { review: null } });
      expect(kinds().filter((kind) => kind.includes("issues/") || kind.includes("/reviews") || kind === "editors")).toEqual([]);
    });

    it("merges on a clean state comment the tool last edited, joined through GraphQL's bare name, with its +1", async () => {
      const { repo, head } = await seedTool();
      answers([fromRun(1, head), fromTool(2, block(head))]);
      gh.editors = [editorsPage([never(1), editedBy(2, "Bot", "chatgpt-codex-connector")])];

      const result = await run(repo, ["land", "--run", RUN]);

      expect(result.doc).toMatchObject({ outcome: "landed", evidence: { review: { state: "clean" } } });
      expect(posted()).toEqual([]);
      // The editors after the bodies, so an edit landing between the two reads shows as a foreign editor rather than being missed.
      expect(kinds().indexOf("editors")).toBeGreaterThan(kinds().indexOf("GET repos/o/r/issues/7/comments"));
      const patched = gh.calls.find((call) => call.method === "PATCH")?.body as { body: string };
      expect(patched.body).toContain(`${LOGIN} reads clean on ${head.slice(0, 7)}`);
    });

    it("re-reads all three reads just before the act: a +1 taken back holds the merge", async () => {
      const { repo, head } = await seedTool();
      answers([fromRun(1, head), fromTool(2, block(head))]);
      gh.routes.set("GET repos/o/r/issues/7/reactions", [{ status: 200, json: [plusOne] }, { status: 200, json: [] }]);
      gh.editors = [editorsPage([never(1), never(2)])];

      const result = await run(repo, ["land", "--run", RUN]);

      expect(result.doc).toMatchObject({ evidence: { review: { state: "waiting", reason: expect.stringContaining("+1") } } });
      expect(kinds()).not.toContain("merge");
    });

    it("refuses on a head moved between the verdict and the act", async () => {
      const { repo, head } = await seedTool();
      answers([fromRun(1, head), fromTool(2, block(head))]);
      gh.editors = [editorsPage([never(1), never(2)])];
      gh.routes.set("GET repos/o/r/pulls/7", [{ status: 200, json: pull(head) }, { status: 200, json: pull("c".repeat(40)) }]);

      const result = await run(repo, ["land", "--run", RUN]);

      expect(result.doc).toMatchObject({ outcome: "refused", notDone: [`pull request #7's head ${"c".repeat(40)} is not HEAD ${head}`] });
      expect(kinds()).not.toContain("merge");
    });

    it("asks the tool once on a head with no run, and leaves the rest for the next call", async () => {
      const { repo, head } = await seedTool();
      answers([]);
      gh.routes.set("GET repos/o/r/issues/7/comments", [{ status: 200, json: [] }, { status: 200, json: [fromRun(1, head)] }]);
      gh.editors = [editorsPage([never(1)])];

      const result = await run(repo, ["land", "--run", RUN]);

      expect(posted()).toEqual([`@codex review\n\n${requestMarker(head)}`]);
      expect(result.code).toBe(1);
      expect(result.doc).toMatchObject({
        outcome: "asks",
        asks: { act: "pr-merge", head, pending: true, reasons: [expect.stringContaining("waiting for")] },
        evidence: { review: { state: "waiting" } },
      });
      expect(kinds()).not.toContain("merge");
    });

    it("does not ask again on a head already asked, and --approved does not pass a wait", async () => {
      const { repo, head } = await seedTool();
      answers([fromRun(1, head)]);
      gh.editors = [editorsPage([never(1)])];

      const result = await run(repo, ["land", "--run", RUN, "--approved", head]);

      expect(posted()).toEqual([]);
      expect(result.doc).toMatchObject({ outcome: "asks", asks: { pending: true } });
      expect(kinds()).not.toContain("merge");
    });

    it("starts the clock with the marker alone where a run is already going on the head", async () => {
      const { repo, head } = await seedTool();
      answers([fromTool(2, block(head, "running"))]);
      gh.editors = [editorsPage([never(2)])];

      await run(repo, ["land", "--run", RUN]);

      expect(posted()).toEqual([requestMarker(head)]);
    });

    it("writes nothing on a dry run", async () => {
      const { repo } = await seedTool();
      answers([]);

      const result = await run(repo, ["land", "--run", RUN, "--dry-run"]);

      expect(posted()).toEqual([]);
      expect(result.doc).toMatchObject({ outcome: "asks", asks: { pending: true } });
    });

    it("posts no request while a plain gap stands, so no round goes on a head that cannot land", async () => {
      const { repo } = await seedTool();
      answers([]);
      gh.threads = [threadsPage([thread(false, null, ["User", "alice"])])];

      const result = await run(repo, ["land", "--run", RUN]);

      expect(posted()).toEqual([]);
      expect(result.doc).toMatchObject({ outcome: "refused", notDone: ["1 review thread is unresolved", expect.stringContaining("no request on this head yet")] });
    });

    // TEST CHANGE, justified (review/49): this pinned `asks` with `asks.pending`. With no marker no wait can end, so that told a
    // token that cannot comment to call again on every call; a request that did not post is a plain refusal now.
    it("refuses where the request did not post, naming it, and waits on nothing", async () => {
      const { slept } = fakeClock();
      const { repo } = await seedTool();
      answers([]);
      route("POST repos/o/r/issues/7/comments", { message: "Forbidden" }, 403);

      const result = await run(repo, ["land", "--run", RUN, "--wait", "5"]);

      expect(result.code).toBe(1);
      expect(result.doc).toMatchObject({ outcome: "refused", notDone: ["the review request was not posted to #7 (HTTP 403)", expect.stringContaining("no request on this head yet")] });
      expect(result.doc).not.toHaveProperty("asks");
      expect(slept).toEqual([]);
      expect(kinds()).not.toContain("merge");
    });

    describe("a head the tool finished with findings before the land was called (review/47)", () => {
      const EARLIER = "e".repeat(40);

      it("posts the marker alone, so that round counts and the rounds read spent", async () => {
        const { repo, head } = await seedTool();
        const finished = fromTool(2, block(head, "completed", true));
        answers([]);
        gh.routes.set("GET repos/o/r/issues/7/comments", [
          { status: 200, json: [fromRun(1, EARLIER, minutesAgo(90)), finished] },
          { status: 200, json: [fromRun(1, EARLIER, minutesAgo(90)), finished, fromRun(3, head)] },
        ]);
        gh.editors = [editorsPage([never(1), never(2), never(3)])];

        const result = await run(repo, ["land", "--run", RUN]);

        expect(posted()).toEqual([requestMarker(head)]);
        expect(result.doc).toMatchObject({ outcome: "refused", evidence: { review: { state: "spent" } }, notDone: [expect.stringContaining("2 of 2 review rounds spent")] });
        expect(kinds()).not.toContain("merge");
      });

      it("reads findings still while rounds remain, and posts nothing on a head already marked", async () => {
        const { repo, head } = await seedTool();
        answers([fromRun(1, head, minutesAgo(5)), fromTool(2, block(head, "completed", true))]);
        gh.editors = [editorsPage([never(1), never(2)])];

        const result = await run(repo, ["land", "--run", RUN]);

        expect(posted()).toEqual([]);
        expect(result.doc).toMatchObject({ outcome: "refused", evidence: { review: { state: "findings" } } });
      });

      it("writes nothing on a dry run, nor on a pull request that does not read as the run's own", async () => {
        const { repo, head } = await seedTool();
        answers([fromTool(2, block(head, "completed", true))]);
        gh.editors = [editorsPage([never(2)])];

        await run(repo, ["land", "--run", RUN, "--dry-run"]);
        route("GET repos/o/r/pulls/7", pull(head, { body: "someone rewrote this" }));
        const result = await run(repo, ["land", "--run", RUN]);

        expect(posted()).toEqual([]);
        expect(result.doc).toMatchObject({ outcome: "refused" });
      });

      it("posts nothing on a pull request already merged at the head", async () => {
        const { repo, head } = await seedTool();
        route("GET repos/o/r/pulls/7", pull(head, { state: "closed", merged: true, mergeable_state: null }));
        answers([fromTool(2, block(head, "completed", true))]);
        gh.editors = [editorsPage([never(2)])];

        const result = await run(repo, ["land", "--run", RUN]);

        expect(posted()).toEqual([]);
        expect(result.doc).toMatchObject({ outcome: "already-landed", evidence: { review: { state: "findings" } } });
      });

      // A head with no marker has spent no round, so even `rounds: 1` reads findings here: why no page says "never as findings".
      it("names a marker that did not post, and the findings stand with no round spent", async () => {
        const { repo, head } = await seedTool({ ...TOOL, rounds: 1 });
        answers([fromTool(2, block(head, "completed", true))]);
        gh.editors = [editorsPage([never(2)])];
        route("POST repos/o/r/issues/7/comments", { message: "Forbidden" }, 403);

        const result = await run(repo, ["land", "--run", RUN]);

        expect(posted()).toEqual([requestMarker(head)]);
        expect(result.code).toBe(1);
        expect(result.doc).toMatchObject({
          outcome: "refused",
          evidence: { review: { state: "findings" } },
          notDone: ["the review request was not posted to #7 (HTTP 403)", expect.stringContaining("reports findings")],
        });
        expect(result.doc).not.toHaveProperty("asks");
      });
    });

    it("ends the wait and refuses where the marker alone did not post, with no pending ask", async () => {
      const { slept } = fakeClock();
      const { repo, head } = await seedTool();
      answers([fromTool(2, block(head, "running"))]);
      gh.editors = [editorsPage([never(2)])];
      route("POST repos/o/r/issues/7/comments", { message: "Forbidden" }, 403);

      const result = await run(repo, ["land", "--run", RUN, "--wait", "5"]);

      expect(posted()).toEqual([requestMarker(head)]);
      expect(result.code).toBe(1);
      expect(result.doc).toMatchObject({ outcome: "refused", notDone: ["the review request was not posted to #7 (HTTP 403)", expect.stringContaining("no request on this head yet")] });
      expect(result.doc).not.toHaveProperty("asks");
      expect(slept).toEqual([]);
      expect(kinds()).not.toContain("merge");
    });

    it("keeps polling on --wait while the tool works, then lands on its word", async () => {
      fakeClock();
      const { repo, head } = await seedTool();
      answers([fromRun(1, head), fromTool(2, block(head))]);
      gh.routes.set("GET repos/o/r/issues/7/comments", [
        { status: 200, json: [fromRun(1, head), fromTool(2, block(head, "running"))] },
        { status: 200, json: [fromRun(1, head), fromTool(2, block(head))] },
      ]);
      gh.editors = [editorsPage([never(1), editedBy(2, "Bot", "chatgpt-codex-connector")])];

      expect((await run(repo, ["land", "--run", RUN, "--wait", "2"])).doc).toMatchObject({ outcome: "landed" });
    });

    it("ends a wait past the verb's budget as asks with a pending line, for the next call", async () => {
      const { slept } = fakeClock();
      const { repo, head } = await seedTool();
      answers([fromRun(1, head), fromTool(2, block(head, "running"))]);
      gh.editors = [editorsPage([never(1), never(2)])];

      const result = await run(repo, ["land", "--run", RUN, "--wait", "9"]);

      expect(slept.reduce((sum, ms) => sum + ms, 0)).toBeLessThanOrEqual(9 * 60_000);
      expect(result.doc).toMatchObject({ outcome: "asks", asks: { pending: true } });
      expect(kinds()).not.toContain("merge");

      // The person's lines, which `--json` leaves out: the wait is named, and no approval is offered for it.
      const plain = await runInProcess([runCommand], ["run", "land", "--run", RUN], { cwd: repo });
      expect(plain.stdout).toContain("pending: run land again");
      expect(plain.stdout).toContain("review: waiting:");
      expect(plain.stdout).not.toContain("approve with");
    });

    it.each([
      ["a person", "User", "a-person", "last edited by a-person"],
      ["a person holding the bot's bare name", "User", "chatgpt-codex-connector", "last edited by chatgpt-codex-connector"],
    ])("holds a state comment last edited by %s rather than dropping it from the count", async (_name, type, login, words) => {
      const { repo, head } = await seedTool();
      // The tool's other comment holds a block too, and alone it would read clean.
      answers([fromRun(1, head, minutesAgo(90)), fromTool(2, block("d".repeat(40))), fromTool(3, block(head))]);
      gh.editors = [editorsPage([never(1), editedBy(2, type, login), never(3)])];

      const result = await run(repo, ["land", "--run", RUN]);

      expect(result.doc).toMatchObject({ outcome: "refused", notDone: [expect.stringContaining(words)], evidence: { review: { state: "silent" } } });
      expect(kinds()).not.toContain("merge");
    });

    it.each([
      ["GraphQL refused", () => (gh.editorsRefused = true)],
      ["a page with errors", () => (gh.editors = [{ errors: [{ message: "denied" }] }])],
      ["a comment missing from the answer", () => (gh.editors = [editorsPage([])])],
      ["paging cut short", () => (gh.editors = [editorsPage([never(2)], { hasNextPage: true, endCursor: "x" }), { errors: [{ message: "denied" }] }])],
    ])("reads an editor it could not read as unknown, never as null, on %s", async (_name, arrange) => {
      const { repo, head } = await seedTool();
      answers([fromRun(1, head, minutesAgo(90)), fromTool(2, block(head))]);
      arrange();

      const result = await run(repo, ["land", "--run", RUN]);

      // TEST CHANGE, justified (review/50): "last edited by unknown" told a person to look for an edit that never happened.
      expect(result.doc).toMatchObject({ outcome: "refused", notDone: [expect.stringContaining("the last editor of its comment did not read")] });
      expect(kinds()).not.toContain("merge");
    });

    it("reads every page of the editors", async () => {
      const { repo, head } = await seedTool();
      answers([fromRun(1, head), fromTool(2, block(head))]);
      gh.editors = [editorsPage([never(1)], { hasNextPage: true, endCursor: "x" }), editorsPage([never(2)])];

      expect((await run(repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "landed" });
    });

    it.each([
      ["findings", () => "findings", "reports findings"],
      ["no +1 past the wait", () => "no-plus-one", "+1"],
    ])("holds on %s", async (_name, which, words) => {
      const { repo, head } = await seedTool();
      const kind = which();
      answers([fromRun(1, head, minutesAgo(90)), fromTool(2, block(head, "completed", kind === "findings"))], kind === "findings" ? [plusOne] : []);
      gh.editors = [editorsPage([never(1), never(2)])];

      expect((await run(repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "refused", notDone: [expect.stringContaining(words)] });
    });

    it("holds for a person when the rounds are spent, naming them", async () => {
      const { repo, head } = await seedTool();
      answers([fromRun(1, "e".repeat(40), minutesAgo(200)), fromRun(2, "f".repeat(40), minutesAgo(100)), fromTool(3, block("f".repeat(40), "completed", true))]);
      gh.editors = [editorsPage([never(1), never(2), never(3)])];

      const result = await run(repo, ["land", "--run", RUN]);

      expect(result.doc).toMatchObject({ outcome: "refused", notDone: [expect.stringContaining("2 of 2 review rounds spent")] });
      expect(posted()).toEqual([]);
      expect(head).not.toBe("e".repeat(40));
    });

    it("counts only the run's own request markers, so a stranger's cannot spend a round or stand for a request", async () => {
      const { repo, head } = await seedTool();
      const strangers = [comment(1, "stranger", "User", requestMarker("e".repeat(40))), comment(2, "stranger", "User", requestMarker("f".repeat(40))), comment(3, "stranger", "User", requestMarker(head))];
      answers(strangers);
      gh.editors = [editorsPage([never(1), never(2), never(3)])];

      const result = await run(repo, ["land", "--run", RUN]);

      expect(result.doc).toMatchObject({ evidence: { review: { state: "waiting" } } });
      expect(posted()).toEqual([`@codex review\n\n${requestMarker(head)}`]);
    });

    it("counts no marker a stranger's text would rejoin into after one strip (review/55)", async () => {
      const { repo, head } = await seedTool();
      const rejoining = (sha: string): string => {
        const whole = requestMarker(sha);
        return `${whole.slice(0, 9)}${whole}${whole.slice(9)}`;
      };
      answers([comment(1, "stranger", "User", rejoining("e".repeat(40))), comment(2, "stranger", "User", rejoining("f".repeat(40))), comment(3, "stranger", "User", rejoining(head))]);
      gh.editors = [editorsPage([never(1), never(2), never(3)])];

      const result = await run(repo, ["land", "--run", RUN]);

      expect(result.doc).toMatchObject({ evidence: { review: { state: "waiting" } } });
      expect(posted()).toEqual([`@codex review\n\n${requestMarker(head)}`]);
    });

    it("reads an app's own request markers in REST's spelling, where viewer names the bare login", async () => {
      const { repo, head } = await seedTool();
      gh.threads = [threadsPage([], "stamity-app", "stamity-app")];
      answers([comment(1, "stamity-app[bot]", "Bot", requestMarker(head))]);
      gh.editors = [editorsPage([never(1)])];

      await run(repo, ["land", "--run", RUN]);

      expect(posted()).toEqual([]);
    });

    it("passes a pasted block from a person for nothing", async () => {
      const { repo, head } = await seedTool();
      answers([fromRun(1, head), comment(2, "a-person", "User", block(head))]);
      gh.editors = [editorsPage([never(1), never(2)])];

      expect((await run(repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "asks", asks: { pending: true }, evidence: { review: { state: "waiting" } } });
    });

    it("reads review-state's review over REST, paged reads naming no other route", async () => {
      const { repo, head } = await seedTool({ login: "reviewer[bot]", request: "please review", clean: "review-state", waitMinutes: 40, rounds: 2 });
      answers([fromRun(1, head)], [], [{ user: { login: "reviewer[bot]" }, commit_id: head, state: "APPROVED" }]);
      gh.editors = [editorsPage([never(1)])];

      expect((await run(repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "landed" });
    });

    it("refuses when a comment read fails, naming it, and when a list is no list", async () => {
      const { repo } = await seedTool();
      answers([]);
      route("GET repos/o/r/issues/7/comments", { message: "Bad Gateway" }, 502);
      expect((await run(repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "refused", notDone: ["the pull request's comments read answered HTTP 502"] });

      route("GET repos/o/r/issues/7/comments", { message: "not a list" });
      expect((await run(repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "refused", notDone: ["the pull request's comments read did not read"] });
    });

    it("refuses past the pages it reads, so a comment past the last page cannot go unseen", async () => {
      const { repo } = await seedTool();
      answers(Array.from({ length: 100 }, (_, index) => comment(index + 1, "someone", "User", "text")));

      expect((await run(repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "refused", notDone: [expect.stringContaining("more than 1000 entries")] });
    });

    it("asks, naming every leg, where the legs disagree, and judges nothing on the first leg's tool", async () => {
      const { repo, head } = await seedTool();
      answers([fromRun(1, head), fromTool(2, block(head))]);
      const other = { ...TOOL, login: "another-reviewer[bot]" };
      await writeFile(join(repo, ".stamity/manifest.json"), `${JSON.stringify({ version: 1, autonomy: { reviewTool: other } })}\n`);

      const result = await run(repo, ["land", "--run", RUN]);

      // TEST CHANGE, justified (review/51): the ask also says the tool's word was not read, since no review is read here.
      expect(result.doc).toMatchObject({
        outcome: "asks",
        asks: { reasons: [expect.stringMatching(/^the legs disagree on autonomy\.reviewTool, and no leg wins: the default branch's manifest, the manifest committed at `HEAD`, the manifest on disk; the review tool's word was not read$/)] },
        evidence: { review: null },
      });
      expect(kinds().filter((kind) => kind.includes("issues/7") || kind === "editors")).toEqual([]);
    });

    it("asks, naming the legs, where they differ on the request alone", async () => {
      const { repo } = await seedTool();
      await writeFile(join(repo, ".stamity/manifest.json"), `${JSON.stringify({ version: 1, autonomy: { reviewTool: { ...TOOL, request: "@codex look away" } } })}\n`);

      expect((await run(repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "asks", asks: { reasons: [expect.stringContaining("the legs disagree on autonomy.reviewTool")] } });
    });
  });

  describe("the tool's own threads (build/29)", () => {
    const LOGIN = "chatgpt-codex-connector[bot]";
    const BARE = "chatgpt-codex-connector";
    const TOOL = { login: LOGIN, request: "@codex review", clean: "state-comment", stateMarker: "codex-review-state:v1", stateSection: "code_review", waitMinutes: 40, rounds: 2 };
    const block = (sha: string, status = "completed", findings = false): string =>
      `<!-- codex-review-state:v1 ${JSON.stringify({ code_review: { commit_sha: sha, has_any_findings: findings, has_unresolved_findings: findings, status } })} -->`;
    const minutesAgo = (minutes: number): string => new Date(Date.now() - minutes * 60_000).toISOString();
    const comment = (id: number, login: string, type: string, body: string, createdAt = minutesAgo(5)): unknown => ({ id, user: { login, type }, body, created_at: createdAt });
    const never = (id: number): unknown => ({ databaseId: id, lastEditedAt: null, editor: null });
    const plusOne = { user: { login: LOGIN, type: "User" }, content: "+1" };
    /** A thread with GitHub's id on it; the first comment is the tool's, unless `authors` name others after it. */
    const named = (id: string, ...authors: [string, string][]): object => ({ ...(thread(false, null, ...authors) as object), id });
    const fromTool = (id: string, ...replies: [string, string][]): object => named(id, ["Bot", BARE], ...replies);
    const closed = (id: string): object => ({ ...(thread(true, "runner", ["Bot", BARE]) as object), id });

    /** A pull request the tool reads clean on, the run's request and the tool's block both on the head. */
    const seedClean = async (tool: Record<string, unknown> = TOOL): Promise<Seeded> => {
      const manifest = `${JSON.stringify({ version: 1, autonomy: { reviewTool: tool } })}\n`;
      const seeded = await seed({ manifest });
      route("GET repos/o/r/contents/.stamity/manifest.json", { content: Buffer.from(manifest).toString("base64"), encoding: "base64" });
      route("POST repos/o/r/issues/7/comments", { id: 900 }, 201);
      route("GET repos/o/r/issues/7/comments", [comment(1, "runner", "User", `@codex review\n\n${requestMarker(seeded.head)}`), comment(2, LOGIN, "Bot", block(seeded.head))]);
      route("GET repos/o/r/issues/7/reactions", [plusOne]);
      route("GET repos/o/r/pulls/7/reviews", []);
      gh.editors = [editorsPage([never(1), never(2)])];
      return seeded;
    };
    const resolved = (): unknown[] => gh.calls.filter((call) => call.kind === "resolve").map((call) => call.body);

    it("resolves the tool's own thread on its clean word, just before the act, re-reads the threads, and merges", async () => {
      const { repo } = await seedClean();
      gh.threads = [threadsPage([fromTool("T1")]), threadsPage([fromTool("T1")]), threadsPage([closed("T1")])];

      const result = await run(repo, ["land", "--run", RUN]);

      expect(result.doc).toMatchObject({ outcome: "landed", evidence: { review: { state: "clean" }, threads: { unresolved: 0 } } });
      expect(resolved()).toEqual(["T1"]);
      const order = kinds();
      const at = order.indexOf("resolve");
      expect(order.slice(at).indexOf("threads")).toBeGreaterThan(0);
      expect(order.indexOf("merge")).toBeGreaterThan(at);
      expect(order.lastIndexOf("threads")).toBeLessThan(order.indexOf("PATCH repos/o/r/pulls/7"));
      const patched = gh.calls.find((call) => call.method === "PATCH")?.body as { body: string };
      expect(patched.body).toContain("0 open threads");
      expect(patched.body).toContain("1 of the tool's review threads resolved on its clean word");
    });

    it("leaves a person's thread and a thread a person replied to, and the land stays refused", async () => {
      const { repo } = await seedClean();
      const page = threadsPage([fromTool("T1"), named("T2", ["User", "alice"]), fromTool("T3", ["User", "alice"]), named("T4", ["User", BARE])]);
      gh.threads = [page];

      const result = await run(repo, ["land", "--run", RUN]);

      expect(result.doc).toMatchObject({ outcome: "refused", notDone: ["3 review threads are unresolved"] });
      expect(resolved()).toEqual([]);
      expect(kinds()).not.toContain("merge");
    });

    it("resolves the tool's thread the run replied to, since the run's own reply is no person's objection", async () => {
      const { repo } = await seedClean();
      gh.threads = [threadsPage([fromTool("T1", ["User", "runner"])]), threadsPage([fromTool("T1", ["User", "runner"])]), threadsPage([closed("T1")])];

      expect((await run(repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "landed" });
      expect(resolved()).toEqual(["T1"]);
    });

    /** What a fix round leaves: the run's request and the tool's block both on the earlier head, and nothing yet on this one. */
    const afterAFixRound = (): unknown[] => [comment(1, "runner", "User", `@codex review\n\n${requestMarker("e".repeat(40))}`, minutesAgo(90)), comment(2, LOGIN, "Bot", block("e".repeat(40)))];

    it("counts the tool's thread as a pending gap on a new head, so the request posts, and resolves nothing (skills-prose W-4)", async () => {
      const { repo, head } = await seedClean();
      route("GET repos/o/r/issues/7/comments", afterAFixRound());
      gh.threads = [threadsPage([fromTool("T1")])];

      const result = await run(repo, ["land", "--run", RUN]);

      expect(gh.calls.filter((call) => call.method === "POST").map((call) => (call.body as { body: string }).body)).toEqual([`@codex review\n\n${requestMarker(head)}`]);
      expect(result.doc).toMatchObject({ outcome: "asks", asks: { pending: true }, evidence: { review: { state: "waiting" } } });
      expect(resolved()).toEqual([]);
      expect(kinds()).not.toContain("merge");
    });

    it("keeps polling on --wait over the tool's thread, then resolves it and lands on the clean word (skills-prose W-4)", async () => {
      fakeClock();
      const { repo, head } = await seedClean();
      const asked = comment(1, "runner", "User", requestMarker(head));
      gh.routes.set("GET repos/o/r/issues/7/comments", [
        { status: 200, json: [asked, comment(2, LOGIN, "Bot", block(head, "running"))] },
        { status: 200, json: [asked, comment(2, LOGIN, "Bot", block(head))] },
      ]);
      gh.threads = [threadsPage([fromTool("T1")]), threadsPage([fromTool("T1")]), threadsPage([fromTool("T1")]), threadsPage([closed("T1")])];

      expect((await run(repo, ["land", "--run", RUN, "--wait", "2"])).doc).toMatchObject({ outcome: "landed" });
      expect(resolved()).toEqual(["T1"]);
    });

    it.each([
      ["a person's thread beside it", () => [fromTool("T1"), named("T2", ["User", "alice"])]],
      ["a person's reply in the tool's thread", () => [fromTool("T1", ["User", "alice"])]],
    ])("keeps %s a plain gap while waiting, so no request goes on a head that cannot land", async (_name, nodes) => {
      const { repo } = await seedClean();
      route("GET repos/o/r/issues/7/comments", afterAFixRound());
      gh.threads = [threadsPage(nodes())];

      const result = await run(repo, ["land", "--run", RUN]);

      expect(result.doc).toMatchObject({ outcome: "refused", notDone: expect.arrayContaining(["1 review thread is unresolved"]), evidence: { review: { state: "waiting" } } });
      expect(gh.calls.filter((call) => call.method === "POST")).toEqual([]);
      expect(resolved()).toEqual([]);
    });

    it.each([
      ["findings", (head: string) => [comment(1, "runner", "User", requestMarker(head)), comment(2, LOGIN, "Bot", block(head, "completed", true))], "findings"],
      ["silence past the wait", (head: string) => [comment(1, "runner", "User", requestMarker(head), minutesAgo(90))], "silent"],
      ["rounds spent", () => [comment(1, "runner", "User", requestMarker("e".repeat(40)), minutesAgo(200)), comment(2, "runner", "User", requestMarker("f".repeat(40)), minutesAgo(100))], "spent"],
    ])("keeps the tool's thread a plain gap and resolves nothing on %s", async (_name, comments, state) => {
      const { repo, head } = await seedClean();
      route("GET repos/o/r/issues/7/comments", comments(head));
      gh.threads = [threadsPage([fromTool("T1")])];

      const result = await run(repo, ["land", "--run", RUN]);

      expect(result.doc).toMatchObject({ outcome: "refused", notDone: expect.arrayContaining(["1 review thread is unresolved"]), evidence: { review: { state } } });
      expect(gh.calls.filter((call) => call.method === "POST")).toEqual([]);
      expect(resolved()).toEqual([]);
      expect(kinds()).not.toContain("merge");
    });

    it("resolves nothing on a clean read that names no commit: a reaction proves no exact head", async () => {
      const { repo } = await seedClean({ login: LOGIN, request: "@codex review", clean: "reaction", waitMinutes: 40, rounds: 2 });
      gh.threads = [threadsPage([fromTool("T1")])];

      const result = await run(repo, ["land", "--run", RUN]);

      expect(result.doc).toMatchObject({ outcome: "refused", notDone: ["1 review thread is unresolved"], evidence: { review: { state: "clean" } } });
      expect(resolved()).toEqual([]);
    });

    it("resolves nothing with no review tool set, the thread a gap as ever", async () => {
      const { repo } = await seed();
      gh.threads = [threadsPage([fromTool("T1")])];

      expect((await run(repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "refused", notDone: ["1 review thread is unresolved"] });
      expect(resolved()).toEqual([]);
    });

    it("resolves nothing on a dry run, and nothing while a person still has to answer an ask", async () => {
      const { repo } = await seedClean();
      gh.threads = [threadsPage([fromTool("T1")])];
      expect((await run(repo, ["land", "--run", RUN, "--dry-run"])).doc).toMatchObject({ outcome: "would-land" });

      route("GET repos/o/r/pulls/7/files", [{ filename: "a.txt" }, { filename: ".github/workflows/ci.yml" }, { filename: "b" }]);
      expect((await run(repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "asks" });

      expect(resolved()).toEqual([]);
      expect(kinds()).not.toContain("merge");
    });

    it.each<[string, () => void, string]>([
      ["gh failing", () => (gh.resolve = null), "gh failed before GitHub answered"],
      ["a refusal", () => (gh.resolve = { status: 403, json: { message: "Forbidden" } }), "HTTP 403"],
      ["GraphQL errors", () => (gh.resolve = { status: 200, json: { errors: [{ message: "denied" }] } }), "GitHub did not say it closed"],
      ["a thread left open", () => (gh.resolve = { status: 200, json: { data: { resolveReviewThread: { thread: { isResolved: false } } } } }), "GitHub did not say it closed"],
    ])("reads a failed resolve as a gap, on %s, so the land does not merge", async (_name, arrange, words) => {
      const { repo } = await seedClean();
      gh.threads = [threadsPage([fromTool("T1")])];
      arrange();

      const result = await run(repo, ["land", "--run", RUN]);

      expect(result.code).toBe(1);
      expect(result.doc).toMatchObject({ outcome: "refused", notDone: [`the tool's review thread T1 was not resolved (${words})`, "1 review thread is unresolved"] });
      expect(kinds()).not.toContain("merge");
    });

    it("trusts the re-read over the resolve's answer: a thread still open there holds the merge", async () => {
      const { repo } = await seedClean();
      gh.threads = [threadsPage([fromTool("T1")])];

      const result = await run(repo, ["land", "--run", RUN]);

      expect(result.doc).toMatchObject({ outcome: "refused", notDone: ["1 review thread is unresolved"] });
      expect(resolved()).toEqual(["T1"]);
      expect(kinds()).not.toContain("merge");
    });

    it("holds a thread a person replied to between the last read and the resolve", async () => {
      const { repo } = await seedClean();
      const replied = { ...(thread(true, "runner", ["Bot", BARE], ["User", "alice"]) as object), id: "T1" };
      gh.threads = [threadsPage([fromTool("T1")]), threadsPage([fromTool("T1")]), threadsPage([replied])];

      // TEST CHANGE, justified: review/120, the reason naming the thread now stands beside the count, whatever other stops there are.
      expect((await run(repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "refused", notDone: ["1 review thread is unresolved", expect.stringContaining("review thread T1")] });
      expect(kinds()).not.toContain("merge");
    });

    it("holds a thread two people wrote in that closed between the last read and the resolve, since no one was shown that ask", async () => {
      const { repo } = await seedClean();
      const other = { ...(thread(true, "bob", ["User", "alice"], ["User", "bob"]) as object), id: "T2" };
      gh.threads = [threadsPage([fromTool("T1")]), threadsPage([fromTool("T1")]), threadsPage([closed("T1"), other])];

      expect((await run(repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "refused", notDone: [expect.stringContaining("closed review threads")] });
      expect(resolved()).toEqual(["T1"]);
      expect(kinds()).not.toContain("merge");
    });

    describe("under a rule requiring resolved conversations (review/68)", () => {
      const HOLDS = "mergeable_state is blocked: an admin merge past the branch's rules asks";
      /** Where such a rule leaves a clean head: the pull request reads `blocked` while the tool's thread stays open. */
      const seedHeld = async (): Promise<Seeded> => {
        const seeded = await seedClean();
        route("GET repos/o/r/pulls/7", pull(seeded.head, { mergeable_state: "blocked" }));
        gh.threads = [threadsPage([fromTool("T1")]), threadsPage([fromTool("T1")]), threadsPage([closed("T1")])];
        return seeded;
      };

      it("resolves before it judges the merge state, reads the pull request again, and merges", async () => {
        const { repo } = await seedHeld();
        gh.afterResolve = [{ mergeable_state: "clean" }];

        const result = await run(repo, ["land", "--run", RUN]);

        expect(result.doc).toMatchObject({ outcome: "landed", evidence: { mergeableState: "clean", threads: { unresolved: 0 } } });
        expect(resolved()).toEqual(["T1"]);
        const order = kinds();
        expect(order.lastIndexOf("GET repos/o/r/pulls/7")).toBeGreaterThan(order.indexOf("resolve"));
        expect(order.lastIndexOf("GET repos/o/r/pulls/7")).toBeLessThan(order.indexOf("PATCH repos/o/r/pulls/7"));
        expect(order.indexOf("merge")).toBeGreaterThan(order.indexOf("resolve"));
      });

      it("reads the pull request again until GitHub has moved the merge state", async () => {
        const { slept } = fakeClock();
        const { repo } = await seedHeld();
        gh.afterResolve = [{ mergeable_state: "blocked" }, { mergeable_state: "unknown" }, { mergeable_state: "clean" }];

        expect((await run(repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "landed", evidence: { mergeableState: "clean" } });
        expect(slept).toEqual([5_000, 5_000]);
      });

      it("refuses where `blocked` outlasts the resolve, so another rule holds it, with the threads closed and no merge", async () => {
        const { slept } = fakeClock();
        const { repo } = await seedHeld();

        const result = await run(repo, ["land", "--run", RUN]);

        expect(result.doc).toMatchObject({ outcome: "refused", notDone: [HOLDS], evidence: { mergeableState: "blocked" } });
        expect(resolved()).toEqual(["T1"]);
        expect(slept).toEqual(Array.from({ length: 12 }, () => 5_000));
        expect(kinds()).not.toContain("merge");
      });

      it("refuses where the read after the resolve finds another head", async () => {
        const { repo, head } = await seedHeld();
        const moved = "e".repeat(40);
        gh.afterResolve = [{ mergeable_state: "clean", head: { ref: RUN_BRANCH, sha: moved, repo: { full_name: "o/r" } } }];

        const result = await run(repo, ["land", "--run", RUN]);

        expect(result.doc).toMatchObject({ outcome: "refused", notDone: [`pull request #7's head ${moved} is not HEAD ${head}`] });
        expect(kinds()).not.toContain("merge");
      });

      it("reads a failed resolve as a gap and waits on no merge state after it", async () => {
        const { slept } = fakeClock();
        const { repo } = await seedHeld();
        gh.threads = [threadsPage([fromTool("T1")])];
        gh.resolve = { status: 403, json: { message: "Forbidden" } };

        const result = await run(repo, ["land", "--run", RUN]);

        expect(result.doc).toMatchObject({ outcome: "refused", notDone: ["the tool's review thread T1 was not resolved (HTTP 403)", "1 review thread is unresolved", HOLDS] });
        expect(slept).toEqual([]);
        expect(kinds()).not.toContain("merge");
      });

      it("keeps `blocked` a plain gap beside a person's thread, and resolves nothing", async () => {
        const { repo } = await seedHeld();
        gh.threads = [threadsPage([fromTool("T1"), named("T2", ["User", "alice"])])];

        const result = await run(repo, ["land", "--run", RUN]);

        expect(result.doc).toMatchObject({ outcome: "refused", notDone: ["1 review thread is unresolved"] });
        expect(resolved()).toEqual([]);
        expect(kinds()).not.toContain("merge");
      });

      it("keeps `blocked` a plain gap with none of the tool's threads open: nothing is left to resolve", async () => {
        const { repo } = await seedHeld();
        gh.threads = [threadsPage([])];

        expect((await run(repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "refused", notDone: [HOLDS] });
      });

      it("resolves nothing on a dry run, and says the merge state waits on the resolve", async () => {
        const { repo } = await seedHeld();

        expect((await run(repo, ["land", "--run", RUN, "--dry-run"])).doc).toMatchObject({ outcome: "would-land", evidence: { mergeableState: "blocked" } });

        gh.threads = [threadsPage([fromTool("T1")])];
        const plain = await runInProcess([runCommand], ["run", "land", "--run", RUN, "--dry-run"], { cwd: repo });
        expect(plain.stdout).toContain("threads: would resolve 1 of the tool's own, and only then is the merge state judged");
        expect(resolved()).toEqual([]);
      });

      it("resolves nothing while a person still has to answer an ask", async () => {
        const { repo } = await seedHeld();
        route("GET repos/o/r/pulls/7/files", [{ filename: "a.txt" }, { filename: ".github/workflows/ci.yml" }, { filename: "b" }]);

        expect((await run(repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "asks" });
        expect(resolved()).toEqual([]);
      });

      it("posts the request on a new head that reads `blocked`, so the tool can still read clean", async () => {
        const { repo, head } = await seedHeld();
        route("GET repos/o/r/issues/7/comments", afterAFixRound());
        gh.threads = [threadsPage([fromTool("T1")])];

        const result = await run(repo, ["land", "--run", RUN]);

        expect(gh.calls.filter((call) => call.method === "POST").map((call) => (call.body as { body: string }).body)).toEqual([`@codex review\n\n${requestMarker(head)}`]);
        expect(result.doc).toMatchObject({
          outcome: "asks",
          asks: { pending: true, reasons: expect.arrayContaining(["mergeable_state is blocked, and the tool's open review threads may be what holds it"]) },
          evidence: { review: { state: "waiting" } },
        });
        expect(resolved()).toEqual([]);
      });

      it("keeps a person's thread a plain gap on a new head, so no request goes on a head that cannot land", async () => {
        const { repo } = await seedHeld();
        route("GET repos/o/r/issues/7/comments", afterAFixRound());
        gh.threads = [threadsPage([fromTool("T1"), named("T2", ["User", "alice"])])];

        expect((await run(repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "refused", notDone: expect.arrayContaining(["1 review thread is unresolved"]) });
        expect(gh.calls.filter((call) => call.method === "POST")).toEqual([]);
      });

      it("runs the whole loop on --wait: the request, the tool's clean word, the resolve, the read and the merge", async () => {
        fakeClock();
        const { repo, head } = await seedHeld();
        const asked = comment(3, "runner", "User", requestMarker(head));
        const [earlier] = afterAFixRound();
        gh.routes.set("GET repos/o/r/issues/7/comments", [
          { status: 200, json: afterAFixRound() },
          { status: 200, json: [...afterAFixRound(), asked] },
          { status: 200, json: [earlier, comment(2, LOGIN, "Bot", block(head)), asked] },
        ]);
        gh.editors = [editorsPage([never(1), never(2), never(3)])];
        gh.threads = [threadsPage([fromTool("T1")]), threadsPage([fromTool("T1")]), threadsPage([fromTool("T1")]), threadsPage([fromTool("T1")]), threadsPage([closed("T1")])];
        gh.afterResolve = [{ mergeable_state: "clean" }];

        expect((await run(repo, ["land", "--run", RUN, "--wait", "2"])).doc).toMatchObject({ outcome: "landed", notDone: [], evidence: { mergeableState: "clean" } });
        expect(resolved()).toEqual(["T1"]);
      });
    });
  });
});
