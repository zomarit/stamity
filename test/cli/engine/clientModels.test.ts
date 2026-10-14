import { existsSync, readFileSync } from "node:fs";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CLIENT_LIST_TIMEOUT_MS,
  listClientModels,
  parseCodexModels,
  parseCopilotHelpConfig,
  parseCursorModels,
} from "../../../src/cli/engine/clientModels.ts";
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

    const outcome = await listClientModels("cursor", onlyOnPath(bin), getTemp().dir);

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

    const live = await listClientModels("codex", onlyOnPath(bin), getTemp().dir);
    const bundled = await listClientModels("codex", onlyOnPath(bin), getTemp().dir, { codexBundled: true });

    expect(live).toEqual({ kind: "listed", ids: ["live-1"], source: "codex-debug-models" });
    expect(bundled.kind === "listed" && bundled.ids[0]).toBe("gpt-6-astra");
  });

  posixOnly("is unreadable when a program of the client's name prints something else", async () => {
    const bin = getTemp().path("bin");
    await fakeProgram(bin, "agent", "printf 'an agent of another kind\\nfake-id - Injected\\n'");

    const outcome = await listClientModels("cursor", onlyOnPath(bin), getTemp().dir);

    expect(outcome).toEqual({
      kind: "unreadable",
      message: "`agent models` printed no model list (expected output opening with `Available models`)",
    });
  });

  posixOnly("is unreadable on a non-zero exit, and the message repeats none of the output", async () => {
    const bin = getTemp().path("bin");
    await fakeProgram(bin, "copilot", "printf 'Configuration Settings:\\n' ; echo secret-detail >&2 ; exit 3");

    const outcome = await listClientModels("copilot", onlyOnPath(bin), getTemp().dir);

    expect(outcome).toEqual({ kind: "unreadable", message: "`copilot help config` exited with status 3" });
  });

  posixOnly(
    "kills a client that outlives the ceiling and answers timeout",
    async () => {
      const bin = getTemp().path("bin");
      await fakeProgram(bin, "codex", "exec sleep 20");

      const started = Date.now();
      const outcome = await listClientModels("codex", onlyOnPath(bin), getTemp().dir);

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

    const outcome = await listClientModels("cursor", onlyOnPath(bin), getTemp().dir, { timeoutMs: 3_000 });

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

  posixOnly("answers absent with nothing started under STAMITY_NO_CLIENT_PROBE=1", async () => {
    const bin = getTemp().path("bin");
    const marker = getTemp().path("started");
    await fakeProgram(bin, "agent", `: > '${marker}'\nprintf 'Available models\\n\\nm-1 - One\\n'`);

    const outcome = await listClientModels("cursor", { PATH: bin, STAMITY_NO_CLIENT_PROBE: "1" }, getTemp().dir);

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
});
