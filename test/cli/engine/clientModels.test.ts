import { existsSync, readFileSync } from "node:fs";
import { chmod, mkdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CLIENT_LIST_TIMEOUT_MS,
  listClientModels,
  parseCodexModels,
  parseCopilotHelpConfig,
  parseCursorModels,
  readModelListCache,
  resolveModelLists,
  trustedSearchPath,
  withModelLists,
  writeModelListCache,
  type ModelLists,
} from "../../../src/cli/engine/clientModels.ts";
import { createManifest } from "../../../src/manifest/manifest.ts";
import type { Tool } from "../../../src/types/core.ts";
import type { SetupManifest } from "../../../src/types/manifest.ts";
import type { ProgramFileProbe } from "../../../src/shared/programPath.ts";
import { useTempDir } from "../../support/tempDir.ts";

/**
 * The client lister (REQ-LADDER-006).
 *
 * The parsers run on every OS over dated captures of each client's real output, read on
 * 2026-10-14 from Cursor `agent models` 2026.10.14, Codex `codex debug models` 0.155.1 and Copilot
 * CLI 1.0.89 `copilot help config`. The Codex capture keeps each catalogue entry's identifying
 * fields only: the full output carries every model's base instructions (about 470 KB) and the
 * parser reads `models[].slug` alone.
 *
 * The lister cases start real programs: small POSIX shell scripts written under a temp folder and
 * reached through a `PATH` that holds only that folder, standing in for a client's CLI because the
 * real ones read the machine's accounts — which no test may do. They run on POSIX only; the
 * Windows rule (an npm `.cmd` shim is never started) is a pure `PATH` walk, proved on every OS
 * through the probe seam.
 */

const getTemp = useTempDir("client-models");

const posixOnly = process.platform === "win32" ? it.skip : it;

function fixture(name: string): string {
  return readFileSync(new URL(`../../fixtures/client-models/${name}`, import.meta.url), "utf8");
}

const CURSOR_CAPTURE = fixture("cursor-agent-models-2026-10-14.txt");
const CODEX_CAPTURE = fixture("codex-debug-models-2026-10-14.json");
const COPILOT_CAPTURE = fixture("copilot-help-config-2026-10-14.txt");

/**
 * The working folder the lister runs in: a `repo` folder beside the fake programs' `bin`, never
 * above it.
 *
 * TEST CHANGE, justified (fix round 1, review/76): these cases ran the lister in the temp root,
 * which holds `bin`. The lister now drops every `PATH` entry inside the working tree, so a fake
 * client below the working folder is no longer started; the cases keep their programs and run
 * from a sibling folder instead, which is the shape a real install has.
 */
async function repoDir(): Promise<string> {
  const repo = getTemp().path("repo");
  await mkdir(repo, { recursive: true });
  return repo;
}

/** Writes an executable shell script named `name` into `folder`. */
async function fakeProgram(folder: string, name: string, body: string): Promise<void> {
  await mkdir(folder, { recursive: true });
  await writeFile(join(folder, name), `#!/bin/sh\n${body}\n`, "utf8");
  await chmod(join(folder, name), 0o755);
}

/**
 * An environment whose `PATH` is `folder` then the system folders the scripts' own `cat` and
 * `sleep` live in, with nothing else of this process's, so no real client CLI can be found.
 */
function onlyOnPath(folder: string): NodeJS.ProcessEnv {
  return { PATH: `${folder}:/usr/bin:/bin` };
}

describe("parseCursorModels", () => {
  it("returns every id of the capture in order", () => {
    const ids = parseCursorModels(CURSOR_CAPTURE);
    expect(ids?.slice(0, 4)).toEqual(["auto", "composer-2.5", "claude-opus-5-thinking-high", "gpt-5.6-sol-high"]);
    expect(ids?.at(-1)).toBe("glm-5.2-max");
    expect(ids).toHaveLength(121);
    expect(ids).toContain("claude-opus-5-5-high");
    // The closing tip is not a model, and a display name never leaks into an id.
    expect(ids?.some((id) => id.startsWith("Tip") || id.includes(" "))).toBe(false);
  });

  it("reads a listing that opens with a byte-order mark", () => {
    expect(parseCursorModels("\uFEFFAvailable models\n\nm-1 - One\n")).toEqual(["m-1"]);
    expect(parseCopilotHelpConfig('\uFEFFConfiguration Settings:\n  `model`: AI\n    - "c-1"\n')).toEqual(["c-1"]);
  });

  it("refuses output that does not open with the listing's header", () => {
    expect(parseCursorModels("Usage: agent [options]\n\nauto - Auto\n")).toBeNull();
    expect(parseCursorModels("")).toBeNull();
    expect(parseCursorModels("Available models\n\n")).toBeNull();
  });

  it("keeps only ids with a model id's shape", () => {
    const text = [
      "\u001b[1mAvailable models\u001b[0m",
      "",
      "good-model-high - Good",
      "bad`id - Backtick",
      "-leading-dash - Dash",
      `${"x".repeat(101)} - Too long`,
      "claude-x - \u001b[31mColoured\u001b[0m",
      "good-model-high - Twice",
    ].join("\r\n");
    expect(parseCursorModels(text)).toEqual(["good-model-high", "claude-x"]);
  });
});

describe("parseCodexModels", () => {
  it("returns every slug of the capture in order, hidden ones included", () => {
    expect(parseCodexModels(CODEX_CAPTURE)).toEqual([
      "gpt-6-astra",
      "gpt-6-sol",
      "gpt-6-luna",
      "gpt-reserve",
      "gpt-5.6-sol",
      "gpt-5.6-terra",
      "gpt-5.6-luna",
      "codex-auto-review",
    ]);
  });

  it("refuses anything that is not the catalogue", () => {
    expect(parseCodexModels("not json")).toBeNull();
    expect(parseCodexModels("[]")).toBeNull();
    expect(parseCodexModels('{"models": {}}')).toBeNull();
    expect(parseCodexModels('{"models": [{"name": "x"}]}')).toBeNull();
  });

  it("drops a slug without a model id's shape", () => {
    expect(parseCodexModels('{"models": [{"slug": "ok-1"}, {"slug": "two words"}, {"slug": "line\\nbreak"}, {"slug": 3}]}')).toEqual([
      "ok-1",
    ]);
  });
});

describe("parseCopilotHelpConfig", () => {
  it("returns the `model` setting's values in order", () => {
    const ids = parseCopilotHelpConfig(COPILOT_CAPTURE);
    expect(ids?.slice(0, 3)).toEqual(["claude-sonnet-5", "claude-fable-5.1", "claude-fable-5"]);
    expect(ids?.at(-1)).toBe("kimi-k2.7-code");
    expect(ids).toHaveLength(29);
    // Values of other settings on the same page are not models.
    expect(ids).not.toContain("always");
    expect(ids).not.toContain("default");
  });

  it("refuses a page without the header or without a `model` entry", () => {
    expect(parseCopilotHelpConfig("Usage: copilot [options]\n")).toBeNull();
    expect(parseCopilotHelpConfig('Configuration Settings:\n\n  `banner`: frequency\n    - "always"\n')).toBeNull();
  });

  it("stops at the first line that is not a value", () => {
    const text = 'Configuration Settings:\n  `model`: AI model\n    - "a-1"\n    - "b 2"\n    - "c-3"\n\n    - "d-4"\n';
    expect(parseCopilotHelpConfig(text)).toEqual(["a-1", "c-3"]);
  });
});

describe("listClientModels", () => {
  posixOnly("reads a listing client's ids through its CLI", async () => {
    const bin = getTemp().path("bin");
    await writeFile(getTemp().path("capture.txt"), CURSOR_CAPTURE, "utf8");
    await fakeProgram(bin, "agent", `[ "$1" = models ] || exit 9\ncat '${getTemp().path("capture.txt")}'`);

    const outcome = await listClientModels("cursor", onlyOnPath(bin), await repoDir());

    expect(outcome.kind).toBe("listed");
    if (outcome.kind !== "listed") return;
    expect(outcome.source).toBe("cursor-agent-models");
    expect(outcome.ids).toEqual(parseCursorModels(CURSOR_CAPTURE));
  });

  posixOnly("passes `--bundled` to Codex only when asked", async () => {
    const bin = getTemp().path("bin");
    await writeFile(getTemp().path("capture.json"), CODEX_CAPTURE, "utf8");
    await fakeProgram(
      bin,
      "codex",
      `[ "$1 $2" = "debug models" ] || exit 9\n[ "$3" = --bundled ] && cat '${getTemp().path("capture.json")}' && exit 0\nprintf '{"models":[{"slug":"live-1"}]}'`,
    );

    const live = await listClientModels("codex", onlyOnPath(bin), await repoDir());
    const bundled = await listClientModels("codex", onlyOnPath(bin), await repoDir(), { codexBundled: true });

    expect(live).toEqual({ kind: "listed", ids: ["live-1"], source: "codex-debug-models" });
    expect(bundled.kind === "listed" && bundled.ids[0]).toBe("gpt-6-astra");
  });

  posixOnly("is unreadable when a program of the client's name prints something else", async () => {
    const bin = getTemp().path("bin");
    await fakeProgram(bin, "agent", "printf 'an agent of another kind\\nfake-id - Injected\\n'");

    const outcome = await listClientModels("cursor", onlyOnPath(bin), await repoDir());

    expect(outcome).toEqual({
      kind: "unreadable",
      message: "`agent models` printed no model list (expected output opening with `Available models`)",
    });
  });

  posixOnly("is unreadable on a non-zero exit, and the message repeats none of the output", async () => {
    const bin = getTemp().path("bin");
    await fakeProgram(bin, "copilot", "printf 'Configuration Settings:\\n' ; echo secret-detail >&2 ; exit 3");

    const outcome = await listClientModels("copilot", onlyOnPath(bin), await repoDir());

    expect(outcome).toEqual({ kind: "unreadable", message: "`copilot help config` exited with status 3" });
  });

  posixOnly(
    "kills a client that outlives the ceiling and answers timeout",
    async () => {
      const bin = getTemp().path("bin");
      await fakeProgram(bin, "codex", "exec sleep 20");

      const started = Date.now();
      const outcome = await listClientModels("codex", onlyOnPath(bin), await repoDir());

      expect(outcome).toEqual({ kind: "timeout" });
      expect(Date.now() - started).toBeLessThan(11_000);
      expect(Date.now() - started).toBeGreaterThanOrEqual(CLIENT_LIST_TIMEOUT_MS - 100);
    },
    15_000,
  );

  posixOnly("gives the child no stdin to wait on", async () => {
    const bin = getTemp().path("bin");
    // `cat` with no file reads stdin to its end; with stdin closed it ends at once.
    await fakeProgram(bin, "agent", "cat >/dev/null\nprintf 'Available models\\n\\nm-1 - One\\n'");

    const outcome = await listClientModels("cursor", onlyOnPath(bin), await repoDir(), { timeoutMs: 3_000 });

    expect(outcome).toEqual({ kind: "listed", ids: ["m-1"], source: "cursor-agent-models" });
  });

  posixOnly("never starts a program from the working folder", async () => {
    const work = getTemp().dir;
    const marker = getTemp().path("started");
    await fakeProgram(work, "codex", `: > '${marker}'\nprintf '{"models":[{"slug":"planted"}]}'`);

    // The working folder by a relative entry, an empty entry and its own full path: none is searched.
    const outcome = await listClientModels("codex", { PATH: `.::${work}` }, work);

    expect(outcome).toEqual({ kind: "absent" });
    expect(existsSync(marker)).toBe(false);
  });

  posixOnly("never starts a program from a folder inside the working tree or a node_modules/.bin", async () => {
    // review/76: npm and npx put the project's `node_modules/.bin` folders ahead of the user's PATH.
    const repo = getTemp().path("repo");
    const marker = getTemp().path("started");
    const planted = `: > '${marker}'\nprintf '{"models":[{"slug":"planted"}]}'`;
    await fakeProgram(join(repo, "node_modules", ".bin"), "codex", planted);
    await fakeProgram(join(repo, "tools", "deep"), "codex", planted);
    await fakeProgram(getTemp().path("elsewhere", "node_modules", ".bin"), "codex", planted);

    const path = [
      join(repo, "node_modules", ".bin"),
      join(repo, "tools", "deep"),
      getTemp().path("elsewhere", "node_modules", ".bin") + "/",
      "/usr/bin",
      "/bin",
    ].join(":");
    const outcome = await listClientModels("codex", { PATH: path }, repo);

    expect(outcome).toEqual({ kind: "absent" });
    expect(existsSync(marker)).toBe(false);
  });

  posixOnly("gives the child the trimmed PATH, so a launcher's `env` interpreter is never the repository's", async () => {
    // review/81: a client stub outside the tree starts its interpreter through `/usr/bin/env`, and
    // the repository plants an interpreter of that name in its own `node_modules/.bin`.
    const repo = await repoDir();
    const marker = getTemp().path("started");
    await fakeProgram(join(repo, "node_modules", ".bin"), "stamity-fake-interp", `: > '${marker}'\nexit 0`);
    await mkdir(getTemp().path("bin"));
    await writeFile(
      getTemp().path("bin", "codex"),
      "#!/usr/bin/env stamity-fake-interp\n",
      "utf8",
    );
    await chmod(getTemp().path("bin", "codex"), 0o755);

    const path = [join(repo, "node_modules", ".bin"), getTemp().path("bin"), "/usr/bin", "/bin"].join(":");
    const outcome = await listClientModels("codex", { PATH: path }, repo);

    expect(existsSync(marker)).toBe(false);
    // `env` finds no interpreter of that name on the trimmed PATH, so the stub fails to start.
    expect(outcome.kind).toBe("unreadable");
  });

  posixOnly("changes nothing else in the child's environment", async () => {
    const repo = await repoDir();
    const bin = getTemp().path("bin");
    const trimmed = `${bin}:/usr/bin:/bin`;
    // The stub reports, as two model ids, whether it saw exactly the trimmed PATH and the other variable.
    await fakeProgram(
      bin,
      "agent",
      `[ "$PATH" = '${trimmed}' ] && p=path-trimmed || p=path-other\nprintf 'Available models\\n\\n%s - P\\n%s - K\\n' "$p" "$KEEP_ME"`,
    );

    const outcome = await listClientModels(
      "cursor",
      { PATH: `${join(repo, "node_modules", ".bin")}:${trimmed}`, KEEP_ME: "kept-1" },
      repo,
    );

    expect(outcome).toEqual({ kind: "listed", ids: ["path-trimmed", "kept-1"], source: "cursor-agent-models" });
  });

  // review/82: the walk skips an empty, `.` or other relative entry as naming the folder the child
  // runs in, and the child's PATH must drop it too. The interpreter is planted both in the working
  // folder and in the folder the child is started in, so the case fails wherever the child runs.
  for (const shape of [":<bin>:/usr/bin:/bin", "<bin>::/usr/bin", ".:<bin>:/usr/bin:/bin", "tools:<bin>:/usr/bin:/bin"]) {
    posixOnly(`gives the child no PATH entry that names a folder by where it runs (PATH "${shape}")`, async () => {
      const repo = await repoDir();
      const home = getTemp().path("home");
      const marker = getTemp().path("started");
      await Promise.all(
        [repo, join(repo, "tools"), home, join(home, "tools")].map((folder) =>
          fakeProgram(folder, "stamity-fake-interp", `: > '${marker}'\nexit 0`),
        ),
      );
      await mkdir(getTemp().path("bin"));
      await writeFile(getTemp().path("bin", "codex"), "#!/usr/bin/env stamity-fake-interp\n", "utf8");
      await chmod(getTemp().path("bin", "codex"), 0o755);

      const outcome = await listClientModels("codex", { PATH: shape.replace("<bin>", getTemp().path("bin")) }, repo, {
        home,
      });

      expect(existsSync(marker)).toBe(false);
      // `env` finds no interpreter of that name on the trimmed PATH, so the stub fails to start.
      expect(outcome.kind).toBe("unreadable");
    });
  }

  posixOnly("starts the child in the home folder, so it reads no setting of the working tree by a relative name", async () => {
    // e3's security W-1: a client CLI reads project-scoped settings from the folder it runs in.
    const repo = await repoDir();
    const home = getTemp().path("home");
    await mkdir(home);
    await writeFile(join(repo, ".stamity-fake-setting"), "planted\n", "utf8");
    const bin = getTemp().path("bin");
    // The stub reports, as two model ids, the folder it runs in and whether it found the planted setting.
    await fakeProgram(
      bin,
      "agent",
      `[ "$(pwd -P)" = '${home}' ] && w=cwd-home || w=cwd-other\n[ -e .stamity-fake-setting ] && s=setting-read || s=setting-unseen\nprintf 'Available models\\n\\n%s - W\\n%s - S\\n' "$w" "$s"`,
    );

    const outcome = await listClientModels("cursor", onlyOnPath(bin), repo, { home });

    expect(outcome).toEqual({ kind: "listed", ids: ["cwd-home", "setting-unseen"], source: "cursor-agent-models" });
  });

  posixOnly("starts nothing when the home folder lies inside the working tree or cannot be read", async () => {
    const repo = await repoDir();
    const marker = getTemp().path("started");
    await fakeProgram(getTemp().path("bin"), "codex", `: > '${marker}'\nprintf '{"models":[{"slug":"m-1"}]}'`);
    await mkdir(join(repo, "home"));

    const outcomes = await Promise.all(
      [repo, join(repo, "home"), getTemp().path("missing")].map((home) =>
        listClientModels("codex", onlyOnPath(getTemp().path("bin")), repo, { home }),
      ),
    );

    const refused = {
      kind: "unreadable",
      message: "no home folder outside the working tree to start `codex` in, so it was not started",
    };
    expect(outcomes).toEqual([refused, refused, refused]);
    expect(existsSync(marker)).toBe(false);
  });

  posixOnly("refuses a program on PATH that links into the working tree, and starts nothing", async () => {
    const repo = getTemp().path("repo");
    const marker = getTemp().path("started");
    await fakeProgram(join(repo, "tools"), "codex", `: > '${marker}'\nprintf '{"models":[{"slug":"planted"}]}'`);
    await mkdir(getTemp().path("bin"));
    await symlink(join(repo, "tools", "codex"), getTemp().path("bin", "codex"));

    const outcome = await listClientModels("codex", onlyOnPath(getTemp().path("bin")), repo);

    expect(outcome).toEqual({
      kind: "unreadable",
      message: "`codex` on PATH resolves inside the working tree, so it was not started",
    });
    expect(existsSync(marker)).toBe(false);
  });

  posixOnly("answers absent with nothing started under STAMITY_NO_CLIENT_PROBE=1", async () => {
    const bin = getTemp().path("bin");
    const marker = getTemp().path("started");
    await fakeProgram(bin, "agent", `: > '${marker}'\nprintf 'Available models\\n\\nm-1 - One\\n'`);

    const outcome = await listClientModels("cursor", { PATH: bin, STAMITY_NO_CLIENT_PROBE: "1" }, await repoDir());

    expect(outcome).toEqual({ kind: "absent" });
    expect(existsSync(marker)).toBe(false);
  });

  it("answers absent with no program on PATH, and for a client with no listing command", async () => {
    const empty = getTemp().path("empty");
    await mkdir(empty);
    expect(await listClientModels("copilot", { PATH: empty }, getTemp().dir)).toEqual({ kind: "absent" });
    expect(await listClientModels("codex", {}, getTemp().dir)).toEqual({ kind: "absent" });
    expect(await listClientModels("claude", { PATH: empty }, getTemp().dir)).toEqual({ kind: "absent" });
  });

  it("answers absent on Windows when only an npm shim holds the client", async () => {
    // A probe stands in for a Windows disk: this host cannot hold a Windows `PATH`, and the walk
    // under test is pure over the platform it is told, so no program is started either way.
    const shims = new Set(["C:\\npm\\codex.cmd", "C:\\npm\\copilot.cmd"]);
    const probe: ProgramFileProbe = {
      isProgramFile: (path) => shims.has(path),
      realPath: (path) => path,
    };

    const outcomes = await Promise.all(
      (["codex", "copilot"] as const).map((tool) =>
        listClientModels(tool, { Path: "C:\\npm" }, "C:\\repo", { platform: "win32", probe }),
      ),
    );
    expect(outcomes).toEqual([{ kind: "absent" }, { kind: "absent" }]);
  });

  it("applies the working-tree and node_modules/.bin rules to Windows paths in any letter case", async () => {
    // Same probe stand-in as above. `D:\\links\\codex.exe` is a link whose real path is in the tree.
    const programs = new Set([
      "C:\\Repo\\node_modules\\.bin\\codex.exe",
      "C:\\repo\\sub\\codex.exe",
      "D:\\Tools\\Node_Modules\\.BIN\\codex.exe",
      "D:\\links\\codex.exe",
    ]);
    const probe: ProgramFileProbe = {
      isProgramFile: (path) => programs.has(path),
      realPath: (path) => (path === "D:\\links\\codex.exe" ? "C:\\REPO\\tools\\codex.exe" : path),
    };
    const env = { Path: "C:\\Repo\\node_modules\\.bin;C:\\repo\\sub;D:\\Tools\\Node_Modules\\.BIN\\" };

    expect(await listClientModels("codex", env, "C:\\repo", { platform: "win32", probe })).toEqual({ kind: "absent" });
    expect(
      await listClientModels("codex", { Path: `${env.Path};D:\\links` }, "C:\\repo", { platform: "win32", probe }),
    ).toEqual({ kind: "unreadable", message: "`codex` on PATH resolves inside the working tree, so it was not started" });
  });

  it("hands the child no Windows entry the runtime's own lookup reads differently from the walk", () => {
    // Same probe stand-in as above: the folders that exist, each its own real path.
    const folders = new Set(["C:\\out", "C:\\repo\\bin", "C:\\Program Files\\x"]);
    const probe: ProgramFileProbe = {
      isProgramFile: () => false,
      realPath: (path) => (folders.has(path) ? path : null),
    };
    const entries = [
      "C:\\out",
      // An unpaired trailing quote, either kind: no folder as the walk reads it, the tree's `bin` as
      // the runtime strips each quote on its own.
      'C:\\repo\\bin"',
      "C:\\repo\\bin'",
      // Each half of a quoted segment the runtime keeps whole across its `;`.
      '"C:\\out',
      'C:\\repo\\bin"',
      '"C:\\Program Files\\x"',
      "C:\\gone",
    ];

    expect(trustedSearchPath(entries.join(";"), "C:\\repo", "win32", probe)).toBe('C:\\out;"C:\\Program Files\\x"');
    // Non-degenerate: POSIX keeps an entry with no real path, as before, and drops the tree's.
    expect(trustedSearchPath("/out:/gone:/repo/bin", "/repo", "linux", { ...probe, realPath: (path) => (path === "/gone" ? null : path) })).toBe(
      "/out:/gone",
    );
  });
});

/** REQ-LADDER-009: the account's lists live in the git-ignored cache, never in the committed manifest. */
describe("the model list cache", () => {
  const CACHE = ".stamity/client-models.json";
  const CODEX = { ids: ["gpt-6-sol", "gpt-5.6-luna"], source: "codex-debug-models" } as const;
  const CURSOR_OLD = { ids: ["claude-opus-5-high"], source: "cursor-agent-models" } as const;
  const CURSOR_FRESH = { ids: ["claude-opus-5-5-high"], source: "cursor-agent-models" } as const;

  /** A manifest selecting `tools`, its ledger naming `ledgered` paths, and `listed` as a 1.15.0 one saved it. */
  function setup(tools: Tool[], ledgered: string[], listed?: ModelLists): SetupManifest {
    const manifest = createManifest({
      tools,
      selection: { items: { agent: [], skill: [], rule: [], command: [] } },
      generatorVersion: "1.16.0",
      now: new Date("2026-10-19T00:00:00.000Z"),
    });
    manifest.ledger = ledgered.map((path) => ({ path, adapter: "copilot", artifactId: "copilot-model-map", artifactType: "infra" }));
    return listed === undefined ? manifest : { ...manifest, models: { listed: structuredClone(listed) } };
  }

  it("reads nothing and names no problem where no cache is, and reads back what it wrote, clients in sort order", async () => {
    const temp = getTemp();

    expect(await readModelListCache(temp.dir)).toEqual({ lists: {}, problem: null });
    expect(await writeModelListCache(temp.dir, { cursor: { ...CURSOR_FRESH, ids: [...CURSOR_FRESH.ids] }, codex: { ...CODEX, ids: [...CODEX.ids] } })).toBeNull();

    expect(Object.keys(JSON.parse(readFileSync(temp.path(CACHE), "utf8")).listed as object)).toEqual(["codex", "cursor"]);
    expect(await readModelListCache(temp.dir)).toEqual({ lists: { codex: CODEX, cursor: CURSOR_FRESH }, problem: null });
  });

  it("reads a cache past the 200-id ceiling, of another shape or holding a malformed id as no list, naming it", async () => {
    const temp = getTemp();
    const flood = Array.from({ length: 201 }, (_unused, index) => `gpt-flood-${index}`);
    // Sequential on purpose: each body is written over the one before at the same path.
    /* oxlint-disable no-await-in-loop */
    for (const body of [
      { listed: { codex: { ids: flood, source: "codex-debug-models" } } },
      { listed: { codex: CODEX }, extra: true },
      { listed: { codex: { ids: ["gpt 6\n"], source: "codex-debug-models" } } },
      { listed: { codex: { ids: ["gpt-6-sol"], source: "a-planted-source" } } },
    ]) {
      await temp.seedFiles({ [CACHE]: JSON.stringify(body) });

      const read = await readModelListCache(temp.dir);

      expect(read.lists).toEqual({});
      expect(read.problem).toContain(`the model list cache ${CACHE} was not read`);
    }
    /* oxlint-enable no-await-in-loop */
    // Exactly 200 ids is still a list.
    await temp.seedFiles({ [CACHE]: JSON.stringify({ listed: { codex: { ids: flood.slice(0, 200), source: "codex-debug-models" } } }) });
    expect((await readModelListCache(temp.dir)).lists.codex?.ids).toHaveLength(200);
  });

  it.skipIf(process.platform === "win32")("reads a cache that is a link as no list, naming it", async () => {
    const temp = getTemp();
    await temp.seedFiles({ "elsewhere.json": JSON.stringify({ listed: { codex: CODEX } }) });
    await mkdir(temp.path(".stamity"), { recursive: true });
    await symlink(temp.path("elsewhere.json"), temp.path(CACHE));

    const read = await readModelListCache(temp.dir);

    expect(read).toEqual({ lists: {}, problem: expect.stringContaining("it is not a regular file") as unknown });
  });

  it("answers a warning, never a throw, when the cache cannot be written", async () => {
    const temp = getTemp();
    await mkdir(temp.path(CACHE), { recursive: true });

    const warning = await writeModelListCache(temp.dir, { codex: { ...CODEX, ids: [...CODEX.ids] } });

    expect(warning).toContain(`could not be kept in ${CACHE}`);
    expect(warning).toContain("held for this run only");
    // review/117: the lists are gone after the run, and only a sync that reads a client brings its list back.
    expect(warning).toContain("were dropped");
    expect(warning).toContain("the next sync that reads a client keeps its list again");
  });

  // review/113: a 1.15.0 manifest's list past the ceiling is refused whole, as the cache reader
  // refuses one, so no cache is written that every later read would turn away.
  it("refuses a 1.15.0 manifest's lists past the 200-id ceiling, writing no cache of them, and names the manifest", async () => {
    const temp = getTemp();
    const flood = Array.from({ length: 201 }, (_unused, index) => `gpt-flood-${index}`);
    const manifest = setup(["codex", "cursor"], [], {
      codex: { ids: flood, source: "codex-debug-models" },
      cursor: { ...CURSOR_OLD, ids: [...CURSOR_OLD.ids] },
    });

    const lists = await resolveModelLists(temp.dir, manifest);

    expect(lists.kept).toEqual({});
    expect(lists.toWrite).toBeNull();
    expect(lists.problem).toContain("the model lists `.stamity/manifest.json` saves under `models.listed` were not moved");
    expect(lists.problem).toContain("more than 200 ids");
    // Exactly 200 ids still moves.
    const fits = await resolveModelLists(temp.dir, setup(["codex"], [], { codex: { ids: flood.slice(0, 200), source: "codex-debug-models" } }));
    expect(fits.toWrite?.codex?.ids).toHaveLength(200);
    expect(fits.problem).toBeNull();
  });

  // review/109 and review/115: a map's list is kept only when each class it records carries a
  // shipped candidate for that class or the client's pin, and it holds the client's pins too.
  it("keeps a map's list only when each class's model is a candidate for it or the pin, and adds the pins", async () => {
    const temp = getTemp();
    const codexMap = ".stamity/generated/models/codex.json";
    const map = (classes: Record<string, unknown>): string => JSON.stringify({ classes, roles: {} });
    const pinned = (ledgered: string[]): SetupManifest => {
      const manifest = setup(["codex"], ledgered);
      return { ...manifest, models: { pins: { standard: { codex: "gpt-9-custom[x=1]" }, economy: { all: "gpt-6-luna" } } } };
    };
    const moved = {
      frontier: { model: "gpt-6-sol", fallbacks: [] },
      advanced: { model: "gpt-6-sol", fallbacks: [] },
      standard: { model: "gpt-6-sol", fallbacks: ["gpt-5.6-terra"] },
      economy: { model: "gpt-6-luna", fallbacks: [] },
    };
    await temp.seedFiles({ [codexMap]: map(moved) });

    const kept = await resolveModelLists(temp.dir, pinned([codexMap]));

    expect(kept.emitted).toEqual({
      codex: { ids: ["gpt-6-sol", "gpt-5.6-terra", "gpt-6-luna", "gpt-9-custom"], source: "codex-debug-models" },
    });
    expect(kept.effective).toEqual(kept.emitted);
    expect(kept.asEmitted).toEqual(kept.emitted);
    // A kept list decides: a pin it lacks is left out, so the plan re-picks it as `sync` does,
    // and one it holds joins.
    const lacking = await resolveModelLists(temp.dir, pinned([codexMap]), { codex: { ids: ["gpt-6-sol", "gpt-6-luna"], source: "codex-debug-models" } });
    expect(lacking.emitted.codex?.ids).toEqual(["gpt-6-sol", "gpt-5.6-terra", "gpt-6-luna"]);
    const holding = await resolveModelLists(temp.dir, pinned([codexMap]), { codex: { ids: ["gpt-9-custom"], source: "codex-debug-models" } });
    expect(holding.emitted.codex?.ids).toEqual(["gpt-6-sol", "gpt-5.6-terra", "gpt-6-luna", "gpt-9-custom"]);

    // Each of these gives no list: a model off the class's candidates that is not its pin, a
    // class with candidates and no model, and a pinned class with no model.
    /* oxlint-disable no-await-in-loop */
    for (const classes of [
      { ...moved, frontier: { model: "gpt-6-luna", fallbacks: [] } },
      { ...moved, frontier: { model: "gpt-planted", fallbacks: [] } },
      { ...moved, advanced: { fallbacks: [] } },
      { ...moved, economy: { fallbacks: [] } },
    ]) {
      await temp.seedFiles({ [codexMap]: map(classes) });

      const read = await resolveModelLists(temp.dir, pinned([codexMap]));

      expect(read.emitted, JSON.stringify(classes)).toEqual({});
      expect(read.asEmitted, JSON.stringify(classes)).toEqual({});
    }
    /* oxlint-enable no-await-in-loop */
    // The map's own pin: a model equal to the pin's base id is kept.
    await temp.seedFiles({ [codexMap]: map({ ...moved, standard: { model: "gpt-9-custom[x=1]", fallbacks: ["gpt-6-sol"] } }) });
    expect((await resolveModelLists(temp.dir, pinned([codexMap]))).emitted.codex?.ids).toEqual([
      "gpt-6-sol",
      "gpt-9-custom",
      "gpt-6-luna",
    ]);
  });

  // review/118: a class the map records as having replaced the manifest's own pin keeps that
  // replacement where this checkout has no list (the pin stays off the list, so it re-picks as the
  // syncing account did); a record of another pin, or of another pick, adds the pin as before.
  it("leaves a pin the map records as replaced off a checkout's list with no cache, and adds one it does not", async () => {
    const temp = getTemp();
    const copilotMap = ".stamity/generated/models/copilot.json";
    const standard = (record: unknown): string =>
      JSON.stringify({ classes: { standard: { model: "gpt-6-sol", fallbacks: ["gpt-5.6-terra"], pinReplaced: record } }, roles: {} });
    const pinned = (pin: string): SetupManifest => ({ ...setup(["copilot"], [copilotMap]), models: { pins: { standard: { copilot: pin } } } });
    await temp.seedFiles({ [copilotMap]: standard({ pin: "gpt-9-custom", by: "gpt-6-sol" }) });

    const recorded = await resolveModelLists(temp.dir, pinned("gpt-9-custom"));

    expect(recorded.emitted).toEqual({ copilot: { ids: ["gpt-6-sol", "gpt-5.6-terra"], source: "copilot-help-config" } });
    expect(recorded.asEmitted).toEqual(recorded.emitted);
    // An unsynced pin edit: the record names the pin the last sync could not honour, not this one.
    expect((await resolveModelLists(temp.dir, pinned("gpt-9-other"))).emitted.copilot?.ids).toEqual([
      "gpt-6-sol",
      "gpt-5.6-terra",
      "gpt-9-other",
    ]);
    // A list on this checkout that holds the pin decides, as it does with no record.
    const holding = await resolveModelLists(temp.dir, pinned("gpt-9-custom"), { copilot: { ids: ["gpt-9-custom"], source: "copilot-help-config" } });
    expect(holding.emitted.copilot?.ids).toEqual(["gpt-6-sol", "gpt-5.6-terra", "gpt-9-custom"]);
    // A record whose pick is not the class's model, or of another shape, is no record.
    /* oxlint-disable no-await-in-loop */
    for (const record of [{ pin: "gpt-9-custom", by: "gpt-5.6-terra" }, "gpt-9-custom", { pin: 9, by: "gpt-6-sol" }]) {
      await temp.seedFiles({ [copilotMap]: standard(record) });

      expect((await resolveModelLists(temp.dir, pinned("gpt-9-custom"))).emitted.copilot?.ids, JSON.stringify(record)).toContain("gpt-9-custom");
    }
    /* oxlint-enable no-await-in-loop */
  });

  // The reviewer's open question on review/114: a client the setup no longer selects still has its
  // ledgered files proved, so the list they give is read for it too.
  it("reads the list a deselected client's ledgered map gives", async () => {
    const temp = getTemp();
    const copilotMap = ".stamity/generated/models/copilot.json";
    await temp.seedFiles({
      [copilotMap]: JSON.stringify({ classes: { economy: { model: "gpt-6-luna", fallbacks: [] } }, roles: {} }),
    });

    const lists = await resolveModelLists(temp.dir, setup(["claude"], [copilotMap]));

    expect(lists.emitted).toEqual({ copilot: { ids: ["gpt-6-luna"], source: "copilot-help-config" } });
    expect(lists.kept).toEqual({});
  });

  it("lays the fresh read over the cache, over a 1.15.0 manifest's lists, over the ledgered emitted map", async () => {
    const temp = getTemp();
    const copilotMap = ".stamity/generated/models/copilot.json";
    await temp.seedFiles({
      [CACHE]: JSON.stringify({ listed: { codex: CODEX } }),
      // Copilot's map, ledgered: each class's model (its bracket options dropped) and its fallbacks.
      // TEST CHANGE, justified (review/109): each class now carries a shipped candidate for it, since a
      // map recording a model off a class's candidates, or none for a class that has some, gives no list.
      [copilotMap]: JSON.stringify({
        classes: { standard: { model: "claude-sonnet-5[x=1]", fallbacks: ["gpt-6-sol"] }, economy: { model: "gpt-6-luna", fallbacks: ["gpt-5.4-mini"] } },
        roles: {},
      }),
      // Codex's map is not ledgered here, so it gives nothing.
      ".stamity/generated/models/codex.json": JSON.stringify({ classes: { standard: { model: "gpt-planted", fallbacks: [] } } }),
    });
    const manifest = setup(["codex", "copilot", "cursor"], [copilotMap], {
      cursor: { ...CURSOR_OLD, ids: [...CURSOR_OLD.ids] },
      codex: { ids: ["gpt-old"], source: "codex-debug-models" },
    });

    const lists = await resolveModelLists(temp.dir, manifest, { cursor: { ...CURSOR_FRESH, ids: [...CURSOR_FRESH.ids] } });

    const fromMap = { ids: ["claude-sonnet-5", "gpt-6-sol", "gpt-6-luna", "gpt-5.4-mini"], source: "copilot-help-config" };
    expect(lists.kept).toEqual({ codex: CODEX, cursor: CURSOR_FRESH });
    expect(lists.effective).toEqual({ codex: CODEX, copilot: fromMap, cursor: CURSOR_FRESH });
    expect(lists.toWrite).toEqual({ codex: CODEX, cursor: CURSOR_FRESH });
    expect(lists.problem).toBeNull();

    // Once kept, with the manifest's key gone, the same read writes nothing new.
    await writeModelListCache(temp.dir, lists.kept);
    const again = await resolveModelLists(temp.dir, setup(["codex", "copilot", "cursor"], [copilotMap]));
    expect(again.toWrite).toBeNull();
    expect(again.effective).toEqual(lists.effective);
    // The emitted map wins over a kept list where the drift gate asks for the picks the files carry.
    const kept = await resolveModelLists(temp.dir, setup(["copilot"], [copilotMap]), { copilot: { ids: ["gpt-6"], source: "copilot-help-config" } });
    expect(kept.effective.copilot?.ids).toEqual(["gpt-6"]);
    expect(kept.asEmitted).toEqual({ codex: CODEX, copilot: fromMap, cursor: CURSOR_FRESH });
  });

  it("reads Cursor's ledgered agent files for the bare model values a list kept, leaving a value with an effort group out", async () => {
    const temp = getTemp();
    const agent = (model: string): string => `---\ndescription: An agent.\nmodel: ${model}\n---\nBody.\n`;
    await temp.seedFiles({
      ".cursor/agents/stamity-a.md": agent("composer-9"),
      ".cursor/agents/stamity-b.md": agent("composer-8[effort=high]"),
      ".cursor/agents/stamity-c.md": agent("claude-opus-5-5-high"),
      // Not ledgered, so not read.
      ".cursor/agents/stamity-planted.md": agent("composer-planted"),
    });
    const manifest = setup(["cursor"], []);
    manifest.ledger = ["stamity-a", "stamity-b", "stamity-c"].map((id) => ({
      path: `.cursor/agents/${id}.md`,
      adapter: "cursor" as const,
      artifactId: id,
      artifactType: "agent" as const,
    }));

    const lists = await resolveModelLists(temp.dir, manifest);

    expect(lists.effective).toEqual({ cursor: { ids: ["composer-9", "claude-opus-5-5-high"], source: "cursor-agent-models" } });
    expect(lists.kept).toEqual({});
    expect(lists.toWrite).toBeNull();
  });

  it("leaves `models.listed` out of the in-memory copy when no list is given, and drops an emptied block", () => {
    const manifest = setup(["cursor"], [], { cursor: { ...CURSOR_OLD, ids: [...CURSOR_OLD.ids] } });

    expect(withModelLists(manifest, {}).models).toBeUndefined();
    expect(withModelLists(manifest, { codex: { ...CODEX, ids: [...CODEX.ids] } }).models).toEqual({ listed: { codex: CODEX } });
  });
});
