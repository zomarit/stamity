// The harness comes first: its module mocks must be in place before any module below loads one they stand in for.
import { gh, git, landHarness, range, row, RUN, RUN_BRANCH, RUN_DIR, thread, threadsPage } from "./runLand.harness.ts";
import type { Seeded } from "./runLand.harness.ts";
import { randomBytes } from "node:crypto";
import { mkdir, symlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { gitSurfaceRecordPath, readRunGitSurface } from "../../../src/cli/commands/gate.ts";
import { surfaceRecord } from "../../../src/runs/gitSurface.ts";
import { EngineError } from "../../../src/types/errors.ts";

/** `stamity run land`: a closed thread someone beside its closer wrote in, the brake and auto-ship. The set-up, the stand-ins and why each one is mocked are in `./runLand.harness.ts`. */

describe("stamity run land", () => {
  const { getRoot, fakeClock, seed, pull, route, put, run, kinds } = landHarness();

  describe("a closed thread someone beside its closer wrote in", () => {
    const ASKS = "a person decides on closed review threads that someone beside the closer wrote in, or that did not read whole: T1";
    const named = (entry: unknown): unknown => ({ ...(entry as object), id: "T1" });

    it.each([
      ["a closer's reply under a person's comment", thread(true, "bob", ["User", "alice"], ["User", "bob"])],
      ["a closer who wrote first", thread(true, "bob", ["User", "bob"], ["User", "alice"])],
      ["a closer who wrote nothing", thread(true, "bob", ["User", "alice"])],
      ["an app closing over a person's comment", thread(true, "review-bot", ["Bot", "review-bot"], ["User", "alice"])],
    ])("asks and merges nothing, on %s", async (_name, entry) => {
      const { repo, head } = await seed();
      gh.threads = [threadsPage([named(entry)])];

      const result = await run(repo, ["land", "--run", RUN]);

      expect(result.code).toBe(1);
      expect(result.doc).toMatchObject({ outcome: "asks", asks: { reasons: [ASKS], act: "pr-merge", head }, evidence: { threads: { unresolved: 0 } } });
      expect(kinds()).not.toContain("merge");
    });

    it("asks on one that did not read whole, whoever it seems to hold", async () => {
      const { repo } = await seed();
      gh.threads = [threadsPage([{ ...(named(thread(true, "bob", ["User", "bob"])) as object), comments: { totalCount: 101, nodes: [{ author: { __typename: "User", login: "bob" } }] } }])];

      expect((await run(repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "asks", asks: { reasons: [ASKS] } });
      expect(kinds()).not.toContain("merge");
    });

    it("lands on a person's approval of that head, and no approval of another head carries it", async () => {
      const { repo, head } = await seed();
      gh.threads = [threadsPage([named(thread(true, "bob", ["User", "alice"], ["User", "bob"]))])];

      expect((await run(repo, ["land", "--run", RUN, "--approved", "f".repeat(40)])).doc).toMatchObject({ outcome: "refused" });
      expect(kinds()).not.toContain("merge");

      expect((await run(repo, ["land", "--run", RUN, "--approved", head])).doc).toMatchObject({ outcome: "landed", approved: { sha: head, reasons: [ASKS] } });
      expect(kinds()).toContain("merge");
    });

    it("stops an unattended run on the ask, which no approval there reaches", async () => {
      const { repo, head } = await seed({ mode: "unattended" });
      const home = getRoot().path("home");
      await mkdir(home, { recursive: true });
      vi.stubEnv("HOME", home);
      vi.stubEnv("XDG_CONFIG_HOME", home);
      vi.stubEnv("GIT_CONFIG_NOSYSTEM", "1");
      vi.stubEnv("GH_HOST", undefined);
      vi.stubEnv("STAMITY_UNATTENDED", undefined);
      const place = await gitSurfaceRecordPath(repo);
      const surface = await readRunGitSurface(repo);
      if ("unreadable" in place || "unreadable" in surface) throw new Error("the seed's git surface could not be read");
      await mkdir(dirname(place.path), { recursive: true });
      await writeFile(place.path, `${JSON.stringify(surfaceRecord(surface, randomBytes(16).toString("hex"), new Date().toISOString(), false))}\n`);
      gh.threads = [threadsPage([named(thread(true, "bob", ["User", "alice"], ["User", "bob"]))])];

      expect((await run(repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "asks", asks: { reasons: [ASKS] } });
      expect((await run(repo, ["land", "--run", RUN, "--approved", head])).doc).toMatchObject({ outcome: "refused" });
      expect(kinds()).not.toContain("merge");
    });

    it("asks when the thread closes after the first read, on the read just before the act", async () => {
      const { repo } = await seed();
      gh.threads = [threadsPage([]), threadsPage([named(thread(true, "bob", ["User", "alice"], ["User", "bob"]))])];

      expect((await run(repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "asks", asks: { reasons: [ASKS] } });
      expect(kinds()).not.toContain("merge");
    });

    it.each([
      ["a person closing their own thread", thread(true, "alice", ["User", "alice"])],
      ["a person closing an app's thread", thread(true, "alice", ["Bot", "codex"])],
      ["the run's own reply beside the closer", thread(true, "alice", ["User", "alice"], ["User", "runner"])],
      ["the run's own close, one account in the thread", thread(true, "runner", ["Bot", "codex"], ["User", "runner"])],
      ["an app closing its own thread", thread(true, "review-bot", ["Bot", "review-bot"], ["User", "runner"])],
    ])("still lands with no ask, on %s", async (_name, entry) => {
      const { repo } = await seed();
      gh.threads = [threadsPage([named(entry)])];

      expect((await run(repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "landed", evidence: { threads: { unresolved: 0 } } });
    });
  });

  describe("the brake (REQ-FLOW-153)", () => {
    const failing = { total_count: 1, check_runs: [{ id: 3, name: "test", status: "completed", conclusion: "failure", app: { id: 15368 } }] };

    it("asks while a required check fails on the tip, naming it, and merges nothing", async () => {
      const { repo, base } = await seed();
      route(`GET repos/o/r/commits/${base}/check-runs`, failing);

      const result = await run(repo, ["land", "--run", RUN]);

      expect(result.code).toBe(1);
      expect(result.doc).toMatchObject({ outcome: "asks", asks: { reasons: ["main is red: test failing on its tip"], act: "pr-merge" }, evidence: { defaultBranch: { failing: ["test"], unread: null } } });
      expect(kinds()).not.toContain("merge");
    });

    it("lets --approved pass the brake, but not a refusal", async () => {
      const { repo, base, head } = await seed();
      route(`GET repos/o/r/commits/${base}/check-runs`, failing);

      expect((await run(repo, ["land", "--run", RUN, "--approved", head])).doc).toMatchObject({ outcome: "landed", approved: { reasons: ["main is red: test failing on its tip"] } });

      gh.threads = [threadsPage([thread(false, null, ["User", "alice"])])];
      expect((await run(repo, ["land", "--run", RUN, "--approved", head])).doc).toMatchObject({ outcome: "refused", notDone: ["1 review thread is unresolved"] });
    });

    it("still asks with a red tip on --fast-forward", async () => {
      const { repo, base } = await seed();
      route("GET repos/o/r/rules/branches/main", [{ type: "required_status_checks", parameters: { required_status_checks: [{ context: "test" }] } }]);
      route(`GET repos/o/r/commits/${base}/check-runs`, failing);
      route(`GET repos/o/r/compare/${base}...${git(repo, ["rev-parse", "HEAD"])}`, { status: "ahead" });

      expect((await run(repo, ["land", "--run", RUN, "--fast-forward"])).doc).toMatchObject({ outcome: "asks", asks: { reasons: ["main is red: test failing on its tip"], act: "push-default" } });
    });

    it("asks when the tip's read fails, naming the read", async () => {
      const { repo, base } = await seed();
      route(`GET repos/o/r/commits/${base}/check-runs`, { message: "Bad Gateway" }, 502);

      expect((await run(repo, ["land", "--run", RUN])).doc).toMatchObject({
        outcome: "asks",
        asks: { reasons: ["main's tip could not be read (the check runs read answered HTTP 502), so whether it is red is not known"] },
      });
    });

    it("reads a required context missing or pending on the tip as not red, and says so in the evidence line", async () => {
      const { repo, base } = await seed();
      route(`GET repos/o/r/commits/${base}/check-runs`, { total_count: 1, check_runs: [{ id: 3, name: "other", status: "completed", conclusion: "failure", app: { id: 15368 } }] });

      const result = await run(repo, ["land", "--run", RUN]);

      expect(result.doc).toMatchObject({ outcome: "landed", evidence: { defaultBranch: { failing: [], notRed: ["test"] } } });
      const patched = gh.calls.find((call) => call.method === "PATCH")?.body as { body: string };
      expect(patched.body).toContain("0 open Critical/Warning rows; main's tip reads not red with test missing or pending");
    });

    /** The default branch's answers: each read takes the next tip, the last repeating. */
    const tips = (...shas: string[]): void => {
      gh.routes.set("GET repos/o/r/branches/main", shas.map((sha) => ({ status: 200, json: { commit: { sha }, protection: { enabled: false } } })));
    };
    const NEWER = "9".repeat(40);

    it("reads the branch again just before the act, so a newer commit that went red asks (review/44, review/54)", async () => {
      const { repo, base } = await seed();
      tips(base, base, NEWER);
      route(`GET repos/o/r/commits/${NEWER}/check-runs`, failing);

      const result = await run(repo, ["land", "--run", RUN]);

      expect(result.doc).toMatchObject({ outcome: "asks", asks: { reasons: ["main is red: test failing on its tip"] }, evidence: { defaultBranch: { failing: ["test"] } } });
      expect(kinds()).not.toContain("merge");
    });

    it("reads the branch again on every --wait poll (review/44, review/54)", async () => {
      fakeClock();
      const { repo, base, head } = await seed();
      route(`GET repos/o/r/commits/${head}/check-runs`, { total_count: 1, check_runs: [{ id: 1, name: "test", status: "in_progress", conclusion: null, app: { id: 15368 } }] });
      tips(base, base, NEWER);
      route(`GET repos/o/r/commits/${NEWER}/check-runs`, failing);

      const result = await run(repo, ["land", "--run", RUN, "--wait", "1"]);

      expect(result.doc).toMatchObject({ outcome: "refused", evidence: { defaultBranch: { failing: ["test"] } } });
    });

    it("asks when the branch stops reading on the re-read, naming the read", async () => {
      const { repo, base } = await seed();
      gh.routes.set("GET repos/o/r/branches/main", [
        { status: 200, json: { commit: { sha: base }, protection: { enabled: false } } },
        { status: 200, json: { commit: { sha: base }, protection: { enabled: false } } },
        { status: 502, json: { message: "Bad Gateway" } },
      ]);

      expect((await run(repo, ["land", "--run", RUN])).doc).toMatchObject({
        outcome: "asks",
        asks: { reasons: ["main's tip could not be read (the default branch read answered HTTP 502), so whether it is red is not known"] },
      });
      expect(kinds()).not.toContain("merge");
    });
  });

  describe("auto-ship (REQ-FLOW-152)", () => {
    const manifestOn = (autoShip: Record<string, unknown>): string =>
      `${JSON.stringify({ version: 1, autonomy: { deployingBranches: ["main"], autoShip: { maxFiles: 10, maxLines: 100, classes: ["product", "records"], ...autoShip } } })}\n`;
    /** GitHub's word on what merges: the merge base its compare names, and the pull request's line counts, as git counts that range. */
    const github = (repo: string, tip: string, head: string, mergeBase = tip, over: Record<string, unknown> = {}): number => {
      route(`GET repos/o/r/compare/${tip}...${head}`, { status: "ahead", merge_base_commit: { sha: mergeBase } });
      const rows = git(repo, ["diff", "--numstat", mergeBase, head]).split("\n").map((line) => line.split("\t"));
      const additions = rows.reduce((sum, [added]) => sum + Number(added), 0);
      const deletions = rows.reduce((sum, [, removed]) => sum + Number(removed), 0);
      route("GET repos/o/r/pulls/7", pull(head, { additions, deletions, ...over }));
      return additions + deletions;
    };
    // TEST CHANGE, justified (review/52, signed off): the verb takes the merge base from GitHub and holds the range against the
    // pull request's file list and line counts, so a seeded land that fits has GitHub agree with the range it reads.
    const seedOn = async (autoShip: Record<string, unknown> = {}): Promise<Seeded> => {
      const manifest = manifestOn(autoShip);
      const seeded = await seed({ manifest });
      route("GET repos/o/r/contents/.stamity/manifest.json", { content: Buffer.from(manifest).toString("base64"), encoding: "base64" });
      github(seeded.repo, seeded.base, seeded.head);
      return seeded;
    };
    const green = { total_count: 1, check_runs: [{ id: 1, name: "test", status: "completed", conclusion: "success", app: { id: 15368 } }] };
    const seededFiles = [{ filename: "a.txt" }, { filename: `${RUN_DIR}/record.md` }, { filename: `${RUN_DIR}/ledger.jsonl` }];
    const incomplete = (why: string): object => ({
      outcome: "asks",
      asks: { reasons: ["main is named in autonomy.deployingBranches", `auto-ship: the classification is incomplete: ${why}`] },
    });
    const CLASS_READ = "repos/o/r/contents/.stamity/change-classes.json";
    /** A file as GitHub's contents read answers one. */
    const fileAnswer = (text: string): object => ({ type: "file", encoding: "base64", content: Buffer.from(text).toString("base64") });
    const raisesTheChange = `${JSON.stringify({ classes: { "security-sensitive": ["a.txt"] } })}\n`;

    it("merges onto a deploying branch with no ask when the change fits, the evidence line naming the rules", async () => {
      const { repo } = await seedOn();

      const result = await run(repo, ["land", "--run", RUN]);

      expect(result.doc).toMatchObject({ outcome: "landed", evidence: { autoShip: { eligible: true } } });
      const patched = gh.calls.find((call) => call.method === "PATCH")?.body as { body: string };
      expect(patched.body).toMatch(/; auto-ship rules met: 3 of at most 10 files; \d+ of at most 100 lines; class /);
    });

    it("counts a rename's two sides through the real range read, and a change that fits still lands", async () => {
      const { repo, remote, base } = await seedOn();
      git(repo, ["mv", "a.txt", "b.txt"]);
      git(repo, ["commit", "-q", "-m", "a rename"]);
      git(repo, ["push", "-q", remote, `HEAD:refs/heads/${RUN_BRANCH}`]);
      const head = git(repo, ["rev-parse", "HEAD"]);
      // TEST CHANGE, justified (review/52, signed off): the range is held against GitHub's list, so the list names what moved.
      github(repo, base, head);
      route("GET repos/o/r/pulls/7/files", [{ filename: "b.txt", previous_filename: "a.txt" }, { filename: `${RUN_DIR}/record.md` }, { filename: `${RUN_DIR}/ledger.jsonl` }]);
      route(`GET repos/o/r/commits/${head}/check-runs`, green);

      const result = await run(repo, ["land", "--run", RUN]);

      expect(result.doc).toMatchObject({ outcome: "landed", evidence: { autoShip: { eligible: true, evidence: expect.stringContaining("auto-ship rules met: 4 of at most 10 files") } } });
    });

    // TEST CHANGE, justified (review/42): a change over the file limit now stops on GitHub's count before any read, so this
    // case keeps to the rules the range answers, and the next one pins the file limit.
    it("asks, naming each rule the change fails", async () => {
      const { repo } = await seedOn({ maxLines: 1, classes: ["records"] });

      const result = await run(repo, ["land", "--run", RUN]);

      expect(result.doc).toMatchObject({
        outcome: "asks",
        asks: {
          reasons: [
            "main is named in autonomy.deployingBranches",
            expect.stringMatching(/^auto-ship: \d+ lines are over autonomy\.autoShip\.maxLines \(1\)$/),
            "auto-ship: product is outside autonomy.autoShip.classes (records)",
          ],
        },
      });
      expect(kinds()).not.toContain("merge");
    });

    it("stops on GitHub's count over the file limit, before any range or class file is read (review/42)", async () => {
      const { repo } = await seedOn({ maxFiles: 2 });

      const result = await run(repo, ["land", "--run", RUN]);

      expect(result.doc).toMatchObject({ outcome: "asks", asks: { reasons: ["main is named in autonomy.deployingBranches", "auto-ship: 3 files are over autonomy.autoShip.maxFiles (2)"] } });
      expect(kinds().filter((kind) => kind.includes("/compare/") || kind.includes("change-classes"))).toEqual([]);
      expect(kinds()).not.toContain("merge");
    });

    // TEST CHANGE, justified (review/52, signed off): the base is GitHub's now, so a shallow clone reaches this as a base GitHub
    // names and the clone does not hold, with no spy in the way; a local shallow file no longer decides anything.
    it("asks on a shallow clone, whose store lacks the base GitHub names, rather than failing", async () => {
      const { repo, base, head } = await seedOn();
      const absent = "d".repeat(40);
      route(`GET repos/o/r/compare/${base}...${head}`, { status: "ahead", merge_base_commit: { sha: absent } });

      const result = await run(repo, ["land", "--run", RUN]);

      expect(result.doc).toMatchObject(incomplete(`the base ${absent} is not a commit the object store holds, so the range cannot be classified`));
      expect(kinds()).not.toContain("merge");
    });

    it("takes the merge base from GitHub, so a planted local parent override cannot shrink what is read (review/52)", async () => {
      // TEST CHANGE, justified (review/42): the limit here was maxFiles, which GitHub's count now answers with no read, so the
      // planted override would go unread. maxLines is answered by the range alone, so the read stays what this case proves.
      const { repo, remote, base, head: work } = await seedOn({ maxLines: 1 });
      await put(repo, "c.txt", "c\n");
      git(repo, ["add", "-A"]);
      git(repo, ["commit", "-q", "-m", "a small last step"]);
      git(repo, ["push", "-q", remote, `HEAD:refs/heads/${RUN_BRANCH}`]);
      const head = git(repo, ["rev-parse", "HEAD"]);
      github(repo, base, head, base, { changed_files: 4 });
      route("GET repos/o/r/pulls/7/files", [...seededFiles, { filename: "c.txt" }]);
      route(`GET repos/o/r/commits/${head}/check-runs`, green);
      // TEST CHANGE, justified (integration round 7): `work` loses its parent too. `work` descends from `base`, so giving `base`
      // the parent `work` alone made a loop, and on a loop git found a merge base only when the two commits shared a second.
      await put(repo, ".git/info/grafts", `${base} ${work}\n${work}\n`);
      // The override is live: local git now calls a commit of the run's the merge base, and the one-file range would fit.
      expect(git(repo, ["merge-base", base, head])).toBe(work);

      const result = await run(repo, ["land", "--run", RUN]);

      expect(result.doc).toMatchObject({ outcome: "asks", asks: { reasons: ["main is named in autonomy.deployingBranches", expect.stringMatching(/^auto-ship: \d+ lines are over autonomy\.autoShip\.maxLines \(1\)$/)] } });
      expect(kinds()).not.toContain("merge");
    });

    it.each([
      ["answers 502", { status: 502, json: { message: "Bad Gateway" } }, "HTTP 502"],
      ["names no merge base", { status: 200, json: { status: "ahead" } }, "HTTP 200"],
      ["names something that is no commit id", { status: 200, json: { merge_base_commit: { sha: "--all" } } }, "HTTP 200"],
    ])("asks when GitHub's compare %s, naming it (review/52)", async (_name, answer, words) => {
      const { repo, base, head } = await seedOn();
      gh.routes.set(`GET repos/o/r/compare/${base}...${head}`, answer);

      const result = await run(repo, ["land", "--run", RUN]);

      expect(result.doc).toMatchObject(incomplete(`GitHub's compare of ${base} and ${head} named no merge base (${words})`));
      expect(kinds()).not.toContain("merge");
    });

    it("asks where the range and the pull request's file list differ, naming the path (review/52)", async () => {
      const { repo, base, head } = await seedOn();
      github(repo, base, head, base, { changed_files: 4 });
      route("GET repos/o/r/pulls/7/files", [...seededFiles, { filename: "other.txt" }]);

      const result = await run(repo, ["land", "--run", RUN]);

      expect(result.doc).toMatchObject(incomplete("the range read and GitHub's file list differ on other.txt"));
      expect(kinds()).not.toContain("merge");
    });

    it("asks where the range's line total is not the pull request's, naming both (review/52)", async () => {
      const { repo, base, head } = await seedOn();
      const counted = github(repo, base, head);
      route("GET repos/o/r/pulls/7", pull(head, { additions: counted + 1, deletions: 0 }));

      const result = await run(repo, ["land", "--run", RUN]);

      expect(result.doc).toMatchObject(incomplete(`the range read counts ${counted} lines and GitHub ${counted + 1}`));
      expect(kinds()).not.toContain("merge");
    });

    it("asks where GitHub names no line counts for the pull request (review/52)", async () => {
      const { repo, base, head } = await seedOn();
      const counted = github(repo, base, head);
      route("GET repos/o/r/pulls/7", pull(head));

      const result = await run(repo, ["land", "--run", RUN]);

      expect(result.doc).toMatchObject(incomplete(`the range read counts ${counted} lines and GitHub none`));
      expect(kinds()).not.toContain("merge");
    });

    it("judges the change by the tip's class file, not the one its fork point holds (review/53)", async () => {
      const { repo, base, head } = await seedOn();
      git(repo, ["switch", "-q", "main"]);
      await put(repo, ".stamity/change-classes.json", raisesTheChange);
      git(repo, ["add", "-A"]);
      git(repo, ["commit", "-q", "-m", "a rule tightened after the run forked"]);
      const tip = git(repo, ["rev-parse", "HEAD"]);
      git(repo, ["switch", "-q", RUN_BRANCH]);
      route("GET repos/o/r/branches/main", { commit: { sha: tip }, protection: { enabled: false } });
      route(`GET repos/o/r/commits/${tip}/check-runs`, green);
      github(repo, tip, head, base);
      // TEST CHANGE, justified (review/69, signed off): the tip's class file is read from GitHub now, so GitHub answers with it.
      route(`GET ${CLASS_READ}`, fileAnswer(raisesTheChange));

      const result = await run(repo, ["land", "--run", RUN]);

      expect(result.doc).toMatchObject({ outcome: "asks", evidence: { autoShip: { eligible: false, reasons: expect.arrayContaining([expect.stringContaining("security-sensitive")]) } } });
      expect(kinds()).not.toContain("merge");
    });

    it("reads the class file from GitHub at the tip's own commit, whatever the clone holds there (review/69)", async () => {
      const { repo, base } = await seedOn();
      route(`GET ${CLASS_READ}`, fileAnswer(raisesTheChange));

      const result = await run(repo, ["land", "--run", RUN]);

      expect(result.doc).toMatchObject({ outcome: "asks", evidence: { autoShip: { eligible: false, reasons: expect.arrayContaining([expect.stringContaining("security-sensitive")]) } } });
      expect(gh.calls.filter((call) => call.path === CLASS_READ).map((call) => call.query)).toEqual([`ref=${base}`]);
      expect(kinds()).not.toContain("merge");
    });

    it("takes no rule from a class file only the clone holds (review/69)", async () => {
      const manifest = manifestOn({});
      const seeded = await seed({ manifest, files: { ".stamity/change-classes.json": raisesTheChange } });
      route("GET repos/o/r/contents/.stamity/manifest.json", { content: Buffer.from(manifest).toString("base64"), encoding: "base64" });
      github(seeded.repo, seeded.base, seeded.head);

      expect((await run(seeded.repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "landed", evidence: { autoShip: { eligible: true } } });
    });

    it.each([
      ["answers 502", { status: 502, json: { message: "Bad Gateway" } }, "HTTP 502"],
      ["answers a folder", { status: 200, json: [{ type: "file", name: "x" }] }, "GitHub's answer is no file"],
      ["answers a link", { status: 200, json: { type: "symlink", target: "x" } }, "GitHub's answer is no file"],
      ["answers a file too large to carry its bytes", { status: 200, json: { type: "file", encoding: "none", content: "" } }, "GitHub's answer is no file"],
    ])("asks when the class file's read %s, naming it (review/69)", async (_name, answer, words) => {
      const { repo, base } = await seedOn();
      gh.routes.set(`GET ${CLASS_READ}`, answer);

      const result = await run(repo, ["land", "--run", RUN]);

      expect(result.doc).toMatchObject(incomplete(`.stamity/change-classes.json did not read from GitHub at ${base} (${words})`));
      expect(kinds()).not.toContain("merge");
    });

    it("asks when gh fails on the class file's read, naming it (review/69)", async () => {
      const { repo, base } = await seedOn();
      gh.failing.add(`GET ${CLASS_READ}`);

      const result = await run(repo, ["land", "--run", RUN]);

      expect(result.doc).toMatchObject(incomplete(`.stamity/change-classes.json did not read from GitHub at ${base} (gh failed)`));
      expect(kinds()).not.toContain("merge");
    });

    // TEST CHANGE, justified: this case pinned a project's own class file judging its change (review/69); the class file no longer follows the start folder, so it pins the ask.
    it("does not auto-ship a land started below the top, whatever class file the project holds", async () => {
      const manifest = manifestOn({});
      const seeded = await seed({ manifest, files: { "apps/web/.stamity/manifest.json": manifest } });
      const web = join(seeded.repo, "apps/web");
      route("GET repos/o/r/contents/apps/web/.stamity/manifest.json", { content: Buffer.from(manifest).toString("base64"), encoding: "base64" });
      route(`GET ${CLASS_READ}`, fileAnswer(`${JSON.stringify({ classes: { "security-sensitive": ["apps/web/app.txt"] } })}\n`));
      route("GET repos/o/r/contents/apps/web/.stamity/change-classes.json", fileAnswer(`${JSON.stringify({ classes: { records: ["app.txt"] } })}\n`));
      await put(web, `${RUN_DIR}/record.md`, `# Run ${RUN}\n\nStatus: in progress\nMode: attended\nBranch: ${RUN_BRANCH}\nBase: ${seeded.base}\n`);
      await put(web, `${RUN_DIR}/ledger.jsonl`, row(`${RUN}/review/1`, "Warning", "fixed"));
      await put(web, "app.txt", "a change the top's class file raises\n");
      git(seeded.repo, ["add", "-A"]);
      git(seeded.repo, ["commit", "-q", "-m", "the project's own change"]);
      git(seeded.repo, ["push", "-q", seeded.remote, `HEAD:refs/heads/${RUN_BRANCH}`]);
      const head = git(seeded.repo, ["rev-parse", "HEAD"]);
      // The tip has moved to the run's first commit, so what merges lies in the project alone.
      route("GET repos/o/r/branches/main", { commit: { sha: seeded.head }, protection: { enabled: false } });
      route(`GET repos/o/r/commits/${seeded.head}/check-runs`, green);
      github(seeded.repo, seeded.head, head, seeded.head, { changed_files: 3 });
      route("GET repos/o/r/pulls/7/files", [{ filename: "apps/web/app.txt" }, { filename: `apps/web/${RUN_DIR}/record.md` }, { filename: `apps/web/${RUN_DIR}/ledger.jsonl` }]);
      route(`GET repos/o/r/commits/${head}/check-runs`, green);
      // The spy above finds the bare remote beside the verb's cwd.
      await symlink(seeded.remote, join(seeded.repo, "apps", "remote.git"));

      const result = await run(web, ["land", "--run", RUN]);

      expect(result.doc).toMatchObject({
        outcome: "asks",
        notDone: [],
        evidence: { autoShip: { eligible: false, reasons: ["auto-ship is judged only from the repository's top, and this land started in apps/web/"] } },
      });
      expect(gh.calls.map((call) => call.path)).not.toContain("repos/o/r/contents/apps/web/.stamity/change-classes.json");
      expect(kinds()).not.toContain("merge");
    });

    it("keeps auto-ship at the top where a project elsewhere names nothing of it", async () => {
      const manifest = manifestOn({});
      const seeded = await seed({ manifest, files: { "test/fixture/.stamity/manifest.json": '{"version":1}\n' } });
      route("GET repos/o/r/contents/test/fixture/.stamity/manifest.json", { content: Buffer.from('{"version":1}\n').toString("base64"), encoding: "base64" });
      github(seeded.repo, seeded.base, seeded.head);

      const result = await run(seeded.repo, ["land", "--run", RUN]);

      expect(result.doc).toMatchObject({ outcome: "landed", notDone: [], evidence: { autoShip: { eligible: true } } });
    });

    it("reads the range's refusal of an absent commit as incomplete, so the land asks instead of failing", async () => {
      const { repo } = await seedOn();
      range.refusal = new EngineError("the base x is not a commit the object store holds", { code: "VALIDATION_ERROR" });

      const result = await run(repo, ["land", "--run", RUN]);

      expect(result.code).toBe(1);
      expect(result.doc).toMatchObject({ outcome: "asks", asks: { reasons: ["main is named in autonomy.deployingBranches", "auto-ship: the classification is incomplete: the base x is not a commit the object store holds"] } });
    });

    it("lets any other failure of the range read stand", async () => {
      const { repo } = await seedOn();
      range.refusal = new Error("a defect");

      const result = await run(repo, ["land", "--run", RUN]);

      expect(result.code).toBe(1);
      expect(result.doc).not.toHaveProperty("outcome");
      expect(kinds()).not.toContain("merge");
    });

    it("still asks for --fast-forward, the rules met", async () => {
      // TEST CHANGE, justified (review/52, signed off): this case's own compare route named no merge base, which now reads as
      // incomplete; `seedOn` routes the compare with one, so the rules are met as the title says.
      const { repo } = await seedOn();
      route("GET repos/o/r/rules/branches/main", []);

      expect((await run(repo, ["land", "--run", RUN, "--fast-forward"])).doc).toMatchObject({ outcome: "asks", asks: { reasons: ["main is named in autonomy.deployingBranches"], act: "push-default" } });
    });

    it("reads no range where the default branch is not deploying", async () => {
      const manifest = `${JSON.stringify({ version: 1, autonomy: { autoShip: { maxFiles: 1, maxLines: 1, classes: ["docs"] } } })}\n`;
      const { repo } = await seed({ manifest });
      route("GET repos/o/r/contents/.stamity/manifest.json", { content: Buffer.from(manifest).toString("base64"), encoding: "base64" });
      range.refusal = new Error("a range was read");

      expect((await run(repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "landed", evidence: { autoShip: null } });
    });
  });
});
