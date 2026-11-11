// The harness comes first: its module mocks must be in place before any module below loads one they stand in for.
import { gh, landHarness, RUN, RUN_BRANCH, taggedLane, thread, threadsPage } from "./runLand.harness.ts";
import { existsSync, realpathSync as fsRealpath } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir, userInfo } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { runCommand } from "../../../src/cli/commands/run.ts";
import { runInProcess } from "../../support/inProcess.ts";

/** `stamity run land`: a landed run's clean-up. The set-up, the stand-ins and why each one is mocked are in `./runLand.harness.ts`. */

describe("stamity run land", () => {
  const { getRoot, seed, pull, route, run, record } = landHarness();

  describe("a landed run's clean-up (d-run-cleanup, REQ-FLOW-176)", () => {
    it("removes the run's tagged clean lane, keeps its branch the checkout has, and records the act", async () => {
      const { repo } = await seed({ files: { ".gitignore": "captures/\n" } });
      const kept = await taggedLane(repo, "p-kept", RUN);
      await mkdir(join(kept, "captures"), { recursive: true });
      await writeFile(join(kept, "captures", "run.log"), "a capture\n");
      const gone = await taggedLane(repo, "p-gone", RUN);

      const result = await run(repo, ["land", "--run", RUN]);

      expect(result.code).toBe(0);
      // TEST CHANGE, justified (REQ-FLOW-176): a lane is named by its farm-relative name and the branch's holder by its
      // place, so no `cleanup` value holds a machine path.
      expect(result.doc).toMatchObject({
        outcome: "landed",
        notDone: [],
        cleanup: {
          removed: ["p-gone"],
          kept: [
            { path: "p-kept", reason: "it holds ignored files: captures/" },
            { path: RUN_BRANCH, reason: "checked out in the main checkout" },
          ],
        },
      });
      expect(existsSync(gone)).toBe(false);
      expect(existsSync(join(kept, "captures", "run.log"))).toBe(true);
      expect((await record(repo)).split("\n").filter((line) => line.includes(" cleanup: "))).toEqual([expect.stringMatching(/^- \S+Z cleanup: removed lane p-gone$/)]);
    });

    it("cleans up on a pull request already merged at the head too", async () => {
      const { repo, head } = await seed();
      const gone = await taggedLane(repo, "p-after", RUN);
      route("GET repos/o/r/pulls/7", pull(head, { state: "closed", merged: true }));

      const result = await run(repo, ["land", "--run", RUN]);

      // TEST CHANGE, justified (REQ-FLOW-176): the removed lane is named by its farm-relative name, not its machine path.
      expect(result.doc).toMatchObject({ outcome: "already-landed", cleanup: { removed: ["p-after"] } });
      expect(existsSync(gone)).toBe(false);
    });

    // REQ-FLOW-176: what the clean-up names reaches a pull request's morning list and a person's terminal, so no value
    // and no printed line holds the folder the farm sits under.
    it("names a kept lane and the branch's holder in its JSON and its printed lines with no machine path", async () => {
      const { repo, head } = await seed({ files: { ".gitignore": "captures/\n" } });
      const kept = await taggedLane(repo, "p-held", RUN);
      await mkdir(join(kept, "captures"), { recursive: true });
      await writeFile(join(kept, "captures", "run.log"), "a capture\n");
      const machine = [dirname(repo), fsRealpath(dirname(repo)), getRoot().dir, tmpdir(), fsRealpath(tmpdir())];

      // The printed lines, from the land itself; the JSON, from the same clean-up run again on the landed pull request.
      const home = getRoot().path("home");
      await mkdir(home, { recursive: true });
      for (const [key, value] of Object.entries({ HOME: home, XDG_CONFIG_HOME: home, GIT_CONFIG_NOSYSTEM: "1" })) vi.stubEnv(key, value);
      vi.stubEnv("GH_HOST", undefined);
      vi.stubEnv("STAMITY_UNATTENDED", undefined);
      const printed = await runInProcess([runCommand], ["run", "land", "--run", RUN], { cwd: repo });
      expect(printed.code).toBe(0);
      const cleanupLines = printed.stdout.split("\n").filter((line) => line.startsWith("cleanup: "));
      expect(cleanupLines).toEqual(["cleanup: kept p-held (it holds ignored files: captures/)", `cleanup: kept ${RUN_BRANCH} (checked out in the main checkout)`]);
      for (const path of machine) expect(`${printed.stdout}${printed.stderr}`).not.toContain(path);

      route("GET repos/o/r/pulls/7", pull(head, { state: "closed", merged: true }));
      const result = await run(repo, ["land", "--run", RUN]);
      expect(result.doc).toMatchObject({ outcome: "already-landed", cleanup: { removed: [], kept: [{ path: "p-held" }, { path: RUN_BRANCH }] } });
      for (const path of machine) expect(JSON.stringify(result.doc["cleanup"])).not.toContain(path);
      expect(existsSync(join(kept, "captures", "run.log"))).toBe(true);
    });

    // review/22: a clean-up whose worktree policy is refused is one `notDone` line, bound for the morning list, so it
    // names what failed and holds no machine path; the landing stands.
    it("lands a run whose committed worktree policy points its farm folder outside the repository's parent, its notDone line naming the failure with no machine path", async () => {
      const { repo } = await seed({ files: { ".stamity/worktree.json": `${JSON.stringify({ version: 1, farmDir: "../../x" })}\n` } });
      const machine = [dirname(repo), fsRealpath(dirname(repo)), getRoot().dir, tmpdir(), fsRealpath(tmpdir()), userInfo().homedir];

      const result = await run(repo, ["land", "--run", RUN]);

      expect(result.code).toBe(0);
      expect(result.doc).toMatchObject({ outcome: "landed", notDone: [expect.stringMatching(/^clean-up not done: .*(farmDir|farm folder|worktree policy)/i)] });
      for (const path of machine) expect(JSON.stringify(result.doc["notDone"])).not.toContain(path);
    });

    it("cleans up nothing on a land that refuses", async () => {
      const { repo } = await seed();
      const lane = await taggedLane(repo, "p-stays", RUN);
      gh.threads = [threadsPage([thread(false, null, ["Bot", "codex"])])];

      const result = await run(repo, ["land", "--run", RUN]);

      expect(result.doc).toMatchObject({ outcome: "refused" });
      expect(result.doc).not.toHaveProperty("cleanup");
      expect(existsSync(lane)).toBe(true);
    });
  });
});
