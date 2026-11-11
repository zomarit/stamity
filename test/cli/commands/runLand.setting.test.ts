// The harness comes first: its module mocks must be in place before any module below loads one they stand in for.
import { git, landHarness, row, RUN, RUN_BRANCH, RUN_DIR } from "./runLand.harness.ts";
import type { Seeded } from "./runLand.harness.ts";
import { randomBytes } from "node:crypto";
import { mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { gitSurfaceRecordPath, readRunGitSurface } from "../../../src/cli/commands/gate.ts";
import { resolveAutonomy } from "../../../src/config/autonomy.ts";
import { CLAUDE_HOOKS_DIR } from "../../../src/hooks/model.ts";
import { buildPersonOnlyGuardScript, PERSON_ONLY_GUARD_FILE } from "../../../src/hooks/scripts.ts";
import { surfaceRecord } from "../../../src/runs/gitSurface.ts";

/** `stamity run land`: a change that loosens a key, and a verb started below the top. The set-up, the stand-ins and why each one is mocked are in `./runLand.harness.ts`. */

describe("stamity run land", () => {
  const { getRoot, seed, pull, route, put, run, kinds } = landHarness();

  describe("a change that loosens a key (REQ-FLOW-138)", () => {
    it("names the key beside the path", async () => {
      const { repo, remote } = await seed();
      route("GET repos/o/r/contents/.stamity/manifest.json", { content: Buffer.from('{"version":1}\n').toString("base64"), encoding: "base64" });
      await writeFile(join(repo, ".stamity/manifest.json"), `${JSON.stringify({ version: 1, autonomy: { deployingBranches: ["release"], adminRuleProof: true } })}\n`);
      git(repo, ["add", "-A"]);
      git(repo, ["commit", "-q", "-m", "loosen"]);
      git(repo, ["push", "-q", remote, `HEAD:refs/heads/${RUN_BRANCH}`]);
      const head = git(repo, ["rev-parse", "HEAD"]);
      route("GET repos/o/r/pulls/7", pull(head));
      route(`GET repos/o/r/commits/${head}/check-runs`, { total_count: 1, check_runs: [{ id: 1, name: "test", status: "completed", conclusion: "success", app: { id: 15368 } }] });
      route("GET repos/o/r/pulls/7/files", [{ filename: "a.txt" }, { filename: ".stamity/manifest.json" }, { filename: `${RUN_DIR}/record.md` }]);

      const result = await run(repo, ["land", "--run", RUN]);

      expect(result.doc).toMatchObject({
        outcome: "asks",
        asks: { reasons: ["the diff touches paths that define the evidence: .stamity/manifest.json", "the head's manifest loosens autonomy.adminRuleProof against main's"] },
      });
    });

    it("names nothing where the pull request leaves the manifest alone, whatever the default branch tightened since (review/45)", async () => {
      const { repo } = await seed();
      const tightened = `${JSON.stringify({ version: 1, autonomy: { deployingBranches: ["release/*"] } })}\n`;
      route("GET repos/o/r/contents/.stamity/manifest.json", { content: Buffer.from(tightened).toString("base64"), encoding: "base64" });

      expect((await run(repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "landed" });
    });

    it("refuses a default-branch read that answers neither 200 nor 404, through the same catch", async () => {
      const { repo } = await seed();
      route("GET repos/o/r/contents/.stamity/manifest.json", { message: "Bad Gateway" }, 502);

      expect((await run(repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "refused", notDone: ["the default branch's manifest read answered HTTP 502"] });
    });
  });

  describe("a verb started below the top reads the repository's setting too (REQ-FLOW-132, REQ-FLOW-138)", () => {
    const PROJECT = "apps/web";
    const MANIFEST = ".stamity/manifest.json";
    const TOP_READ = `GET repos/o/r/contents/${MANIFEST}`;
    const PROJECT_READ = `GET repos/o/r/contents/${PROJECT}/${MANIFEST}`;
    const PLAIN = '{"version":1}\n';
    const NAMED = `${JSON.stringify({ version: 1, autonomy: { deployingBranches: ["main"] } })}\n`;
    const DEPLOYING = "main is named in autonomy.deployingBranches";
    const NO_TOP = `main holds no ${MANIFEST} at the repository's top, so nothing a run cannot write binds this land: a person places one there first`;
    const GREEN = { total_count: 1, check_runs: [{ id: 1, name: "test", status: "completed", conclusion: "success", app: { id: 15368 } }] };
    const onGitHub = (text: string): Record<string, string> => ({ content: Buffer.from(text).toString("base64"), encoding: "base64" });

    /** The run's record and ledger in the project, committed and pushed as the head; `disk` is a manifest there that no commit holds. */
    async function project(seeded: Seeded, opts: { mode?: "attended" | "unattended"; disk?: string } = {}): Promise<string> {
      const web = join(seeded.repo, PROJECT);
      await put(web, `${RUN_DIR}/record.md`, `# Run ${RUN}\n\nStatus: in progress\nMode: ${opts.mode ?? "attended"}\nBranch: ${RUN_BRANCH}\nBase: ${seeded.base}\n`);
      await put(web, `${RUN_DIR}/ledger.jsonl`, row(`${RUN}/review/1`, "Warning", "fixed"));
      git(seeded.repo, ["add", "-A"]);
      git(seeded.repo, ["commit", "-q", "-m", "the project's own record"]);
      git(seeded.repo, ["push", "-q", seeded.remote, `HEAD:refs/heads/${RUN_BRANCH}`]);
      const head = git(seeded.repo, ["rev-parse", "HEAD"]);
      route("GET repos/o/r/pulls/7", pull(head, { changed_files: 5 }));
      route("GET repos/o/r/pulls/7/files", [
        { filename: "a.txt" },
        { filename: `${RUN_DIR}/record.md` },
        { filename: `${RUN_DIR}/ledger.jsonl` },
        { filename: `${PROJECT}/${RUN_DIR}/record.md` },
        { filename: `${PROJECT}/${RUN_DIR}/ledger.jsonl` },
      ]);
      route(`GET repos/o/r/commits/${head}/check-runs`, GREEN);
      // The spy above finds the bare remote beside the verb's cwd.
      await symlink(seeded.remote, join(seeded.repo, "apps", "remote.git"));
      if (opts.disk !== undefined) await put(web, MANIFEST, opts.disk);
      return web;
    }

    /** A passing pre-flight record, written where the verb reads it, under the environment the verb runs in. */
    async function preflightPassed(repo: string): Promise<void> {
      const home = getRoot().path("home");
      await mkdir(home, { recursive: true });
      for (const [key, value] of Object.entries({ HOME: home, XDG_CONFIG_HOME: home, GIT_CONFIG_NOSYSTEM: "1" })) vi.stubEnv(key, value);
      const place = await gitSurfaceRecordPath(repo);
      const surface = await readRunGitSurface(repo);
      if ("unreadable" in place || "unreadable" in surface) throw new Error("the seed's git surface could not be read");
      await mkdir(dirname(place.path), { recursive: true });
      await writeFile(place.path, `${JSON.stringify(surfaceRecord(surface, randomBytes(16).toString("hex"), new Date().toISOString(), false))}\n`);
    }

    it("asks at the top on what a project the default branch holds names, the top naming nothing", async () => {
      const seeded = await seed({ files: { [`${PROJECT}/${MANIFEST}`]: NAMED } });
      route(PROJECT_READ, onGitHub(NAMED));

      expect((await run(seeded.repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "asks", asks: { reasons: [DEPLOYING], act: "pr-merge" }, notDone: [] });
      expect(kinds()).not.toContain("merge");
    });

    it("asks the same unattended at the top, on a passing pre-flight record", async () => {
      const seeded = await seed({ mode: "unattended", files: { [`${PROJECT}/${MANIFEST}`]: NAMED } });
      route(PROJECT_READ, onGitHub(NAMED));
      await preflightPassed(seeded.repo);

      expect((await run(seeded.repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "asks", asks: { reasons: [DEPLOYING], act: "pr-merge" }, notDone: [] });
      expect(kinds()).not.toContain("merge");
    });

    it("asks in a sibling folder on what a project the default branch holds names", async () => {
      const seeded = await seed({ files: { [`apps/api/${MANIFEST}`]: NAMED } });
      route(`GET repos/o/r/contents/apps/api/${MANIFEST}`, onGitHub(NAMED));
      const web = await project(seeded, { disk: PLAIN });

      expect((await run(web, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "asks", asks: { reasons: [DEPLOYING] }, notDone: [] });
      expect(kinds()).not.toContain("merge");
    });

    it("refuses a failed read of a project elsewhere, the top's reading well", async () => {
      const seeded = await seed({ files: { [`${PROJECT}/${MANIFEST}`]: PLAIN } });
      route(PROJECT_READ, { message: "Bad Gateway" }, 502);

      expect((await run(seeded.repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "refused", notDone: ["the default branch's manifest read answered HTTP 502"] });
      expect(kinds()).not.toContain("merge");
    });

    it("refuses at the top where the default branch's only setup sits below it", async () => {
      const seeded = await seed({ manifest: null, files: { [`${PROJECT}/${MANIFEST}`]: NAMED } });
      route(PROJECT_READ, onGitHub(NAMED));
      await put(seeded.repo, MANIFEST, PLAIN);

      expect((await run(seeded.repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "refused", notDone: [NO_TOP] });
      expect(kinds()).not.toContain("merge");
    });

    it("refuses the same unattended, on a passing pre-flight record", async () => {
      const seeded = await seed({ mode: "unattended", manifest: null, files: { [`${PROJECT}/${MANIFEST}`]: NAMED } });
      route(PROJECT_READ, onGitHub(NAMED));
      await put(seeded.repo, MANIFEST, PLAIN);
      await preflightPassed(seeded.repo);

      expect((await run(seeded.repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "refused", notDone: [NO_TOP] });
      expect(kinds()).not.toContain("merge");
    });

    it("refuses at the top where the setup is only the run's own, on its branch and in its work tree", async () => {
      const seeded = await seed();
      route(TOP_READ, { message: "Not Found" }, 404);

      expect((await run(seeded.repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "refused", notDone: [NO_TOP] });
      expect(kinds()).not.toContain("merge");
    });

    it("asks on the top's default branch manifest, a folder with no manifest there starting the verb", async () => {
      const seeded = await seed();
      route(TOP_READ, onGitHub(NAMED));
      const web = await project(seeded, { disk: PLAIN });

      const result = await run(web, ["land", "--run", RUN]);

      expect(result.doc).toMatchObject({ outcome: "asks", asks: { reasons: [DEPLOYING], act: "pr-merge" }, notDone: [] });
      expect(kinds()).not.toContain("merge");
    });

    it("asks the same unattended, on a passing pre-flight record", async () => {
      const seeded = await seed();
      route(TOP_READ, onGitHub(NAMED));
      const web = await project(seeded, { mode: "unattended", disk: PLAIN });
      await preflightPassed(seeded.repo);

      const result = await run(web, ["land", "--run", RUN]);

      expect(result.doc).toMatchObject({ outcome: "asks", asks: { reasons: [DEPLOYING], act: "pr-merge" }, notDone: [] });
      expect(kinds()).not.toContain("merge");
    });

    it("asks on the manifest the top's HEAD alone names", async () => {
      const seeded = await seed({ manifest: NAMED });
      route(TOP_READ, onGitHub(PLAIN));
      const web = await project(seeded, { disk: PLAIN });
      await writeFile(join(seeded.repo, MANIFEST), PLAIN);

      expect((await run(web, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "asks", asks: { reasons: [DEPLOYING] } });
      expect(kinds()).not.toContain("merge");
    });

    it("asks on the manifest the top's work tree alone names", async () => {
      const seeded = await seed();
      route(TOP_READ, onGitHub(PLAIN));
      const web = await project(seeded, { disk: PLAIN });
      await writeFile(join(seeded.repo, MANIFEST), NAMED);

      expect((await run(web, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "asks", asks: { reasons: [DEPLOYING] } });
      expect(kinds()).not.toContain("merge");
    });

    it("asks on the guard the top alone holds", async () => {
      const seeded = await seed();
      route(TOP_READ, onGitHub(PLAIN));
      const web = await project(seeded, { disk: PLAIN });
      const guard = buildPersonOnlyGuardScript({ tool: "claude", layout: "claude", autonomy: resolveAutonomy({ autonomy: { deployingBranches: ["main"] } }) });
      await put(seeded.repo, `${CLAUDE_HOOKS_DIR}/${PERSON_ONLY_GUARD_FILE}`, guard);

      expect((await run(web, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "asks", asks: { reasons: [DEPLOYING] } });
      expect(kinds()).not.toContain("merge");
    });

    it("names the key a head loosens in the top's manifest", async () => {
      const seeded = await seed();
      route(TOP_READ, onGitHub(PLAIN));
      await writeFile(join(seeded.repo, MANIFEST), `${JSON.stringify({ version: 1, autonomy: { adminRuleProof: true } })}\n`);
      const web = await project(seeded, { disk: PLAIN });
      route("GET repos/o/r/pulls/7/files", [
        { filename: "a.txt" },
        { filename: MANIFEST },
        { filename: `${RUN_DIR}/record.md` },
        { filename: `${RUN_DIR}/ledger.jsonl` },
        { filename: `${PROJECT}/${RUN_DIR}/record.md` },
        { filename: `${PROJECT}/${RUN_DIR}/ledger.jsonl` },
      ]);
      route("GET repos/o/r/pulls/7", pull(git(seeded.repo, ["rev-parse", "HEAD"]), { changed_files: 6 }));

      const result = await run(web, ["land", "--run", RUN]);

      expect(result.doc).toMatchObject({ outcome: "asks", asks: { reasons: [`the diff touches paths that define the evidence: ${MANIFEST}`, "the head's manifest loosens autonomy.adminRuleProof against main's"] } });
    });

    describe("a head that changes another setup's manifest", () => {
      const OTHER = `apps/api/${MANIFEST}`;
      const HELD = `the diff touches paths that define the evidence: ${OTHER}`;
      const LOOSENED = "the head's manifest loosens autonomy.deployingBranches against main's";

      /** `main` holding `held` at {@link OTHER}, as GitHub answers it. */
      async function holding(held: string): Promise<Seeded> {
        const seeded = await seed({ files: { [OTHER]: held } });
        route(`GET repos/o/r/contents/${OTHER}`, onGitHub(held));
        return seeded;
      }

      /** What the seed's head changed in the work tree, committed and pushed as the head, the pull request naming {@link OTHER} beside the seed's files. */
      function asTheHead(seeded: Seeded): void {
        git(seeded.repo, ["add", "-A"]);
        git(seeded.repo, ["commit", "-q", "-m", "the change"]);
        git(seeded.repo, ["push", "-q", seeded.remote, `HEAD:refs/heads/${RUN_BRANCH}`]);
        const head = git(seeded.repo, ["rev-parse", "HEAD"]);
        route("GET repos/o/r/pulls/7", pull(head, { changed_files: 4 }));
        route("GET repos/o/r/pulls/7/files", [{ filename: "a.txt" }, { filename: OTHER }, { filename: `${RUN_DIR}/record.md` }, { filename: `${RUN_DIR}/ledger.jsonl` }]);
        route(`GET repos/o/r/commits/${head}/check-runs`, GREEN);
      }

      it("names the key it takes out, beside the path, started at the top", async () => {
        const seeded = await holding(NAMED);
        await writeFile(join(seeded.repo, OTHER), PLAIN);
        asTheHead(seeded);

        expect((await run(seeded.repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "asks", asks: { reasons: [HELD, LOOSENED, DEPLOYING] }, notDone: [] });
        expect(kinds()).not.toContain("merge");
      });

      it("names the key its deletion takes, beside the path, started at the top", async () => {
        const seeded = await holding(NAMED);
        await rm(join(seeded.repo, OTHER));
        asTheHead(seeded);

        expect((await run(seeded.repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "asks", asks: { reasons: [HELD, LOOSENED, DEPLOYING] }, notDone: [] });
        expect(kinds()).not.toContain("merge");
      });

      it("names the key it takes out, started in a sibling folder", async () => {
        const seeded = await holding(NAMED);
        await writeFile(join(seeded.repo, OTHER), PLAIN);
        const web = await project(seeded, { disk: PLAIN });
        route("GET repos/o/r/pulls/7", pull(git(seeded.repo, ["rev-parse", "HEAD"]), { changed_files: 6 }));
        route("GET repos/o/r/pulls/7/files", [
          { filename: "a.txt" },
          { filename: OTHER },
          { filename: `${RUN_DIR}/record.md` },
          { filename: `${RUN_DIR}/ledger.jsonl` },
          { filename: `${PROJECT}/${RUN_DIR}/record.md` },
          { filename: `${PROJECT}/${RUN_DIR}/ledger.jsonl` },
        ]);

        expect((await run(web, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "asks", asks: { reasons: [HELD, LOOSENED, DEPLOYING] }, notDone: [] });
        expect(kinds()).not.toContain("merge");
      });

      it("names no key for a change that loosens none, as a sync's", async () => {
        const seeded = await holding(NAMED);
        await writeFile(join(seeded.repo, OTHER), `${JSON.stringify({ version: 1, autonomy: { deployingBranches: ["main"] }, ledger: [] })}\n`);
        asTheHead(seeded);

        expect((await run(seeded.repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "asks", asks: { reasons: [HELD, DEPLOYING] }, notDone: [] });
      });
    });

    it("lands a project the default branch holds, where it and the top agree, reading both", async () => {
      const seeded = await seed({ files: { [`${PROJECT}/${MANIFEST}`]: PLAIN } });
      route(TOP_READ, onGitHub(PLAIN));
      route(PROJECT_READ, onGitHub(PLAIN));
      const web = await project(seeded);

      expect((await run(web, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "landed", notDone: [] });
      expect(kinds()).toEqual(expect.arrayContaining([TOP_READ, PROJECT_READ]));
    });

    it("refuses a project the default branch holds where the top holds no setup at all, which waits for a person to place one", async () => {
      const seeded = await seed({ manifest: null, files: { [`${PROJECT}/${MANIFEST}`]: PLAIN } });
      route(PROJECT_READ, onGitHub(PLAIN));
      const web = await project(seeded);

      expect((await run(web, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "refused", notDone: [NO_TOP] });
      expect(kinds()).not.toContain("merge");
    });

    it("keeps the project's own setting, which tightens the top's", async () => {
      const seeded = await seed({ files: { [`${PROJECT}/${MANIFEST}`]: NAMED } });
      route(TOP_READ, onGitHub(PLAIN));
      route(PROJECT_READ, onGitHub(NAMED));
      const web = await project(seeded);

      expect((await run(web, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "asks", asks: { reasons: [DEPLOYING] } });
      expect(kinds()).not.toContain("merge");
    });

    it("lets no project below the top loosen the top's setting", async () => {
      const seeded = await seed({ manifest: NAMED, files: { [`${PROJECT}/${MANIFEST}`]: PLAIN } });
      route(TOP_READ, onGitHub(NAMED));
      route(PROJECT_READ, onGitHub(PLAIN));
      const web = await project(seeded);

      expect((await run(web, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "asks", asks: { reasons: [DEPLOYING] } });
      expect(kinds()).not.toContain("merge");
    });

    it("refuses where the default branch holds no manifest for the top or the project, so the run's own files would be the whole setting", async () => {
      const seeded = await seed({ manifest: null });
      const web = await project(seeded, { disk: PLAIN });

      const result = await run(web, ["land", "--run", RUN]);

      expect(result.doc).toMatchObject({ outcome: "refused", notDone: [NO_TOP] });
      expect(kinds()).not.toContain("merge");
    });

    it("refuses a failed read of the top's manifest, the project's reading well", async () => {
      const seeded = await seed({ files: { [`${PROJECT}/${MANIFEST}`]: PLAIN } });
      route(TOP_READ, { message: "Bad Gateway" }, 502);
      route(PROJECT_READ, onGitHub(PLAIN));
      const web = await project(seeded);

      expect((await run(web, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "refused", notDone: ["the default branch's manifest read answered HTTP 502"] });
      expect(kinds()).not.toContain("merge");
    });

    it("refuses as no setup found where no leg holds a manifest, at the top or below it", async () => {
      const seeded = await seed({ manifest: null });
      const web = await project(seeded);

      expect((await run(web, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "refused", notDone: [expect.stringMatching(/^no setup found/)] });
    });
  });
});
