import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFile, chmod, mkdir, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertNotLoosened,
  gateGuardCopies,
  guardCopySetting,
  readBaseline,
  strictGuardGate,
  type GuardCopies,
  type GuardGate,
} from "../../../src/cli/engine/autonomyGate.ts";
import { resolveAutonomy, type ResolvedAutonomy } from "../../../src/config/autonomy.ts";
import { CLAUDE_HOOKS_DIR } from "../../../src/hooks/model.ts";
import { PERSON_ONLY_GUARD_FILE, buildPersonOnlyGuardScript } from "../../../src/hooks/scripts.ts";
import { TOOLS } from "../../../src/types/core.ts";
import { HOOKS_GENERATED_DIR } from "../../../src/types/markers.ts";
import { classifyFailure } from "../../../src/resilience/failureClass.ts";
import { DEPLOYING_ACTS, type AutonomyConfig } from "../../../src/types/manifest.ts";
import { EngineError } from "../../../src/types/errors.ts";
import { NO_GIT_CONFIG, carriedProcessEnv, seedGitRepo } from "../../support/repoFixtures.ts";
import { useTempDir } from "../../support/tempDir.ts";

/**
 * The loosen gate (REQ-FLOW-138, the CLI half): the baseline's three legs, the
 * refusal, the per-copy marker comparison the write loops run, and the census
 * of every caller of the two write loops. Real files and a real git throughout;
 * the guard copies are the guard builder's own output.
 */

const tempDir = useTempDir("stamity-autonomy-gate");

/** The guard paths the plan writes (`src/emit/hooksInfra.ts:523-529`): Claude Code's copy, then each client's generated one. */
const GUARD_COPY_PATHS: readonly string[] = [
  `${CLAUDE_HOOKS_DIR}/${PERSON_ONLY_GUARD_FILE}`,
  ...TOOLS.map((tool) => `${HOOKS_GENERATED_DIR}/${tool}/${PERSON_ONLY_GUARD_FILE}`),
];
const CLAUDE_COPY = GUARD_COPY_PATHS[0] ?? "";
/** A write that plans, and bakes, Claude Code's copy alone. */
const CLAUDE_ONLY: GuardCopies = { planned: [CLAUDE_COPY], baking: [CLAUDE_COPY] };
const MARKER = "// stamity-autonomy ";

function setting(autonomy?: AutonomyConfig): ResolvedAutonomy {
  return resolveAutonomy(autonomy === undefined ? {} : { autonomy });
}

/** A guard copy exactly as this release writes it for `autonomy`. */
function guardText(autonomy?: AutonomyConfig): string {
  return buildPersonOnlyGuardScript({ tool: "claude", layout: "claude", autonomy: setting(autonomy) });
}

/** `text` without its marker line: a copy of this release someone stripped. */
function withoutMarker(text: string): string {
  return text
    .split("\n")
    .filter((line) => !line.startsWith(MARKER))
    .join("\n");
}

/** `text` with its marker line replaced by `donor`'s: a copy whose marker alone someone rewrote. */
function withMarkerOf(text: string, donor: string): string {
  const marker = donor.split("\n").find((line) => line.startsWith(MARKER)) ?? "";
  return text
    .split("\n")
    .map((line) => (line.startsWith(MARKER) ? marker : line))
    .join("\n");
}

/** The ledger row the engine records for `text` written at `path`. */
function recordedRow(path: string, text: string): { path: string; contentHash: string } {
  return { path, contentHash: createHash("sha256").update(text).digest("hex") };
}

async function put(root: string, rel: string, text: string): Promise<void> {
  await mkdir(dirname(join(root, rel)), { recursive: true });
  await writeFile(join(root, rel), text, "utf8");
}

// TEST CHANGE, justified: REQ-FLOW-138 — the baseline now reads the owned files of the manifest at HEAD (build/9), so the fixture manifest carries the ledger a real setup has, recording Claude Code's guard copy; `ledger` overrides it.
function manifestText(autonomy?: AutonomyConfig, ledger: unknown = [{ path: CLAUDE_COPY }]): string {
  return `${JSON.stringify({ version: "2.0.0", tools: ["claude"], ...(autonomy === undefined ? {} : { autonomy }), ledger })}\n`;
}

/** Commits what `root` holds, or skips the case on a machine with no git. */
async function commitAll(root: string, skip: () => void): Promise<void> {
  try {
    await seedGitRepo(root);
  } catch (error) {
    if (error instanceof Error && error.name === "GitUnavailableError") skip();
    throw error;
  }
}

describe("readBaseline — the strictest of the guard copies, HEAD and the manifest on disk", () => {
  it("is the default on a first init: no copy, no manifest, no repository", async () => {
    // TEST CHANGE, justified: REQ-FLOW-138 — the baseline reads only the guard paths the write plans (review/65), so the case names them.
    const root = tempDir().path("repo");
    await mkdir(root, { recursive: true });
    expect(await readBaseline(root, GUARD_COPY_PATHS)).toEqual(setting());
  });

  it("reads a guard copy's baked mode `ask`, and the strictest of two copies", async () => {
    // TEST CHANGE, justified: REQ-FLOW-138 — the baseline reads only the guard paths the write plans (review/65), so the case names them.
    const root = tempDir().path("repo");
    await put(root, CLAUDE_COPY, guardText());
    await put(root, GUARD_COPY_PATHS[1] ?? "", guardText({ mode: "ask", deployingBranches: ["production"] }));
    const baseline = await readBaseline(root, GUARD_COPY_PATHS);
    expect(baseline.mode).toBe("ask");
    expect(baseline.deployingBranches).toEqual(["production"]);
  });

  it("reads the manifest on disk before the write", async () => {
    // TEST CHANGE, justified: REQ-FLOW-138 — the baseline reads only the guard paths the write plans (review/65), so the case names them.
    const root = tempDir().path("repo");
    await put(root, CLAUDE_COPY, guardText());
    await put(root, ".stamity/manifest.json", manifestText({ deployingActs: ["workflow-dispatch"] }));
    expect((await readBaseline(root, GUARD_COPY_PATHS)).deploying).toEqual(["workflow-dispatch"]);
  });

  it("reads a manifest on disk that is not JSON as the strictest setting", async () => {
    // TEST CHANGE, justified: REQ-FLOW-138 — the baseline reads only the guard paths the write plans (review/65), so the case names them.
    const root = tempDir().path("repo");
    await put(root, CLAUDE_COPY, guardText());
    await put(root, ".stamity/manifest.json", "{ not json");
    expect(await readBaseline(root, GUARD_COPY_PATHS)).toEqual(setting({ mode: "ask", deployingActs: [...DEPLOYING_ACTS] }));
  });

  it.skipIf(process.platform === "win32")("reads a guard path holding a link as the strictest setting", async () => {
    // TEST CHANGE, justified: REQ-FLOW-138 — the baseline reads only the guard paths the write plans (review/65), so the case names them.
    const root = tempDir().path("repo");
    await put(root, "elsewhere.mjs", guardText());
    await mkdir(dirname(join(root, CLAUDE_COPY)), { recursive: true });
    await symlink(join(root, "elsewhere.mjs"), join(root, CLAUDE_COPY));
    expect(await readBaseline(root, GUARD_COPY_PATHS)).toEqual(setting({ mode: "ask", deployingActs: [...DEPLOYING_ACTS] }));
  });

  it("reads the autonomy committed at HEAD over a looser manifest on disk", async ({ skip }) => {
    // TEST CHANGE, justified: REQ-FLOW-138 — the baseline reads only the guard paths the write plans (review/65), so the case names them.
    const root = tempDir().path("repo");
    await put(root, CLAUDE_COPY, guardText());
    await put(root, ".stamity/manifest.json", manifestText({ mode: "ask" }));
    await commitAll(root, skip);
    await put(root, ".stamity/manifest.json", manifestText());
    expect((await readBaseline(root, GUARD_COPY_PATHS)).mode).toBe("ask");
  });

  it("reads `ask` when no guard copy is on disk while HEAD holds a manifest, even a looser one", async ({ skip }) => {
    // TEST CHANGE, justified: REQ-FLOW-138 — the baseline reads only the guard paths the write plans (review/65), so the case names them.
    const root = tempDir().path("repo");
    await put(root, CLAUDE_COPY, guardText({ mode: "ask" }));
    await put(root, ".stamity/manifest.json", manifestText());
    await commitAll(root, skip);
    // The copy is deleted from disk; HEAD still holds it and the manifest.
    await rm(join(root, CLAUDE_COPY));
    expect((await readBaseline(root, GUARD_COPY_PATHS)).mode).toBe("ask");
  });

  it("puts no HEAD leg where HEAD holds no manifest", async ({ skip }) => {
    // TEST CHANGE, justified: REQ-FLOW-138 — the baseline reads only the guard paths the write plans (review/65), so the case names them.
    const root = tempDir().path("repo");
    // TEST CHANGE, justified: REQ-FLOW-138 — a scratch file name no tracked file has, so the test-input guard reads no repository file here (it was red on a38c554a).
    await put(root, "history-only.txt", "a repository with history and no setup\n");
    await commitAll(root, skip);
    expect(await readBaseline(root, GUARD_COPY_PATHS)).toEqual(setting());
  });
});

/** `.git/config` made unparseable: every git read in the checkout now exits 128 (git refuses the repository). */
async function breakGitConfig(root: string): Promise<void> {
  await appendFile(join(root, ".git", "config"), "\n[core\n  not a config line\n", "utf8");
}

describe("readBaseline — with no guard copy on disk, the copies committed at HEAD (review/56, review/64)", () => {
  it("reads the default copies committed at HEAD as the default, so a clean then init over a default setup passes", async ({ skip }) => {
    const root = tempDir().path("repo");
    await put(root, CLAUDE_COPY, guardText());
    await put(root, ".stamity/manifest.json", manifestText());
    await commitAll(root, skip);
    // A full clean: the state folder and every guard copy gone; HEAD unchanged.
    await rm(join(root, ".stamity"), { recursive: true, force: true });
    await rm(join(root, CLAUDE_COPY));
    expect(await readBaseline(root, [CLAUDE_COPY])).toEqual(setting());
    await expect(assertNotLoosened(root, setting(), { loosen: false, copies: CLAUDE_ONLY })).resolves.toBeUndefined();
  });

  it("keeps the deploying lists HEAD's copies bake when a committed manifest drops them and the copies are deleted", async ({ skip }) => {
    const root = tempDir().path("repo");
    await put(root, CLAUDE_COPY, guardText({ deployingActs: ["workflow-dispatch"], deployingBranches: ["production"] }));
    // The committed manifest leaves the lists out; the copy at HEAD still names them.
    await put(root, ".stamity/manifest.json", manifestText());
    await commitAll(root, skip);
    await rm(join(root, CLAUDE_COPY));
    const baseline = await readBaseline(root, [CLAUDE_COPY]);
    expect(baseline.deploying).toEqual(["workflow-dispatch"]);
    expect(baseline.deployingBranches).toEqual(["production"]);
    await expect(assertNotLoosened(root, setting(), { loosen: false, copies: CLAUDE_ONLY })).rejects.toMatchObject({
      code: "AUTONOMY_LOOSENED",
      why: expect.stringContaining(`the guard copy \`${CLAUDE_COPY}\` committed at \`HEAD\``) as unknown,
    });
  });

  it("reads `ask` when HEAD holds a manifest and no guard copy at the planned paths", async ({ skip }) => {
    const root = tempDir().path("repo");
    await put(root, ".stamity/manifest.json", manifestText());
    await commitAll(root, skip);
    expect(await readBaseline(root, [CLAUDE_COPY])).toEqual(setting({ mode: "ask" }));
  });
});

describe("readBaseline — only the guard paths the write plans count as a copy (review/65)", () => {
  it("does not let a file at an unselected client's path or the retired path switch off the no-copy fallback", async ({ skip }) => {
    const root = tempDir().path("repo");
    await put(root, CLAUDE_COPY, guardText({ mode: "ask" }));
    // A looser manifest committed: HEAD's manifest leg alone says the default.
    await put(root, ".stamity/manifest.json", manifestText());
    await commitAll(root, skip);
    await rm(join(root, CLAUDE_COPY));
    // Files at guard paths this write does not plan: another client's folder, the retired Claude generated path.
    await put(root, `${HOOKS_GENERATED_DIR}/codex/${PERSON_ONLY_GUARD_FILE}`, "");
    await put(root, `${HOOKS_GENERATED_DIR}/claude/${PERSON_ONLY_GUARD_FILE}`, guardText());
    expect((await readBaseline(root, [CLAUDE_COPY])).mode).toBe("ask");
  });

  it("reads text at a planned guard path that is no guard it knows as the strictest setting, never the default", async () => {
    const root = tempDir().path("repo");
    for (const text of ["", "export {};\n", "#!/usr/bin/env node\n// stamity — person-only shell guard.\n"]) {
      // oxlint-disable-next-line no-await-in-loop -- one case at a time on one path
      await put(root, CLAUDE_COPY, text);
      // oxlint-disable-next-line no-await-in-loop -- one case at a time on one path
      expect(await readBaseline(root, [CLAUDE_COPY]), JSON.stringify(text)).toEqual(setting({ mode: "ask", deployingActs: [...DEPLOYING_ACTS] }));
    }
  });

  it("reads a guard copy at the container layout's planned path", async () => {
    const root = tempDir().path("repo");
    const container = `${HOOKS_GENERATED_DIR}/claude/${PERSON_ONLY_GUARD_FILE}`;
    await put(root, container, guardText({ mode: "ask" }));
    expect((await readBaseline(root, [container])).mode).toBe("ask");
    // TEST CHANGE, justified: REQ-FLOW-138 — a recognised copy at any known guard path is now a tighten-only leg (review/85, review/86 sign-off), so the unplanned copy keeps `ask`.
    expect((await readBaseline(root, [CLAUDE_COPY])).mode).toBe("ask");
  });
});

describe("readBaseline — every client's known guard path is a tighten-only leg (review/85, review/86)", () => {
  const CODEX_COPY = `${HOOKS_GENERATED_DIR}/codex/${PERSON_ONLY_GUARD_FILE}`;

  it("keeps the deploying lists of a deselected client's copy when a committed manifest switches clients and drops them", async ({ skip }) => {
    const root = tempDir().path("repo");
    const strict = guardText({ mode: "ask", deployingBranches: ["production"], deployingActs: ["workflow-dispatch"] });
    await put(root, CLAUDE_COPY, strict);
    await put(root, ".stamity/manifest.json", manifestText({ mode: "ask" }));
    await commitAll(root, skip);
    // The write now plans only another client's copy.
    // TEST CHANGE, justified: REQ-FLOW-138 — a copy at an unplanned path stands in only when HEAD holds it, never on the disk ledger's word (review/88, review/89).
    const baseline = await readBaseline(root, [CODEX_COPY]);
    expect(baseline.deployingBranches).toEqual(["production"]);
    expect(baseline.deploying).toEqual(["workflow-dispatch"]);
    await expect(
      assertNotLoosened(root, setting({ mode: "ask" }), { loosen: false, copies: { planned: [CODEX_COPY], baking: [CODEX_COPY] } }),
    ).rejects.toMatchObject({ code: "AUTONOMY_LOOSENED", why: expect.stringContaining(`the guard copy \`${CLAUDE_COPY}\` on disk`) as unknown });
  });

  it("passes a switch from a committed claude-only default setup to another client: the copy at HEAD stands in", async ({ skip }) => {
    // TEST CHANGE, justified: REQ-FLOW-138 — a copy at an unplanned path stands in only when HEAD holds it, never on the disk ledger's word (review/88, review/89).
    const root = tempDir().path("repo");
    await put(root, CLAUDE_COPY, guardText());
    await put(root, ".stamity/manifest.json", manifestText());
    await commitAll(root, skip);
    const copies = { planned: [CODEX_COPY], baking: [CODEX_COPY] };
    expect(await readBaseline(root, copies.planned)).toEqual(setting());
    await expect(assertNotLoosened(root, setting(), { loosen: false, copies })).resolves.toBeUndefined();
  });

  it("lets a planted guard-looking file at an unselected path neither loosen nor switch the fallback off, a forged ledger row included; a committed one stands in", async ({ skip }) => {
    // TEST CHANGE, justified: REQ-FLOW-138 — a copy at an unplanned path stands in only when HEAD holds it, never on the disk ledger's word (review/88, review/89).
    const root = tempDir().path("repo");
    await put(root, ".stamity/manifest.json", manifestText());
    await commitAll(root, skip);
    const planted = guardText();
    await put(root, CODEX_COPY, planted);
    // Unrecorded: the fallback stays on, and the default it reads loosens nothing.
    expect(await readBaseline(root, [CLAUDE_COPY])).toEqual(setting({ mode: "ask" }));
    // Beside a stricter planned copy it changes nothing either.
    await put(root, CLAUDE_COPY, guardText({ mode: "ask", deployingBranches: ["production"] }));
    expect(await readBaseline(root, [CLAUDE_COPY])).toEqual(setting({ mode: "ask", deployingBranches: ["production"] }));
    await rm(join(root, CLAUDE_COPY));
    // A ledger row forged for the planted bytes vouches for nothing: the write loop's gate still refuses.
    await expect(
      gateGuardCopies(root, [{ path: CLAUDE_COPY, content: guardText() }], [recordedRow(CODEX_COPY, planted)], strictGuardGate(root, "stamity sync --loosen")),
    ).rejects.toMatchObject({ code: "AUTONOMY_LOOSENED", why: expect.stringContaining("no guard copy found") as unknown });
    // Committed, it stands in for the planned copy (the commit residual).
    await commitAll(root, skip);
    expect(await readBaseline(root, [CLAUDE_COPY])).toEqual(setting());
  });

  it("reads a recognised copy committed at HEAD at an unplanned path when no planned copy is on disk", async ({ skip }) => {
    const root = tempDir().path("repo");
    await put(root, CLAUDE_COPY, guardText({ mode: "ask", deployingBranches: ["production"] }));
    await put(root, ".stamity/manifest.json", manifestText({ mode: "ask" }));
    await commitAll(root, skip);
    await rm(join(root, CLAUDE_COPY));
    expect((await readBaseline(root, [CODEX_COPY])).deployingBranches).toEqual(["production"]);
  });

  it("gives no leg for unrecognised text at an unplanned path, so a stray file refuses nothing", async () => {
    const root = tempDir().path("repo");
    await put(root, CLAUDE_COPY, guardText());
    await put(root, CODEX_COPY, "not a guard\n");
    expect(await readBaseline(root, [CLAUDE_COPY])).toEqual(setting());
  });
});

describe("readBaseline — a setup from before the guard (build/9, decision D6)", () => {
  it("reads the upgrade default when the manifest at HEAD owns no guard copy and none is on disk or at HEAD", async ({ skip }) => {
    const root = tempDir().path("repo");
    await put(root, ".stamity/manifest.json", manifestText(undefined, [{ path: "owned/guide.txt" }, { path: "owned/settings.txt" }]));
    await commitAll(root, skip);
    expect(await readBaseline(root, [CLAUDE_COPY])).toEqual(setting());
    await expect(assertNotLoosened(root, setting(), { loosen: false, copies: CLAUDE_ONLY })).resolves.toBeUndefined();
  });

  it("still refuses a looser write when the manifest at HEAD records a guard copy that is now deleted", async ({ skip }) => {
    const root = tempDir().path("repo");
    await put(root, ".stamity/manifest.json", manifestText(undefined, [{ path: `${HOOKS_GENERATED_DIR}/cursor/${PERSON_ONLY_GUARD_FILE}` }]));
    await commitAll(root, skip);
    expect(await readBaseline(root, [CLAUDE_COPY])).toEqual(setting({ mode: "ask" }));
    await expect(assertNotLoosened(root, setting(), { loosen: false, copies: CLAUDE_ONLY })).rejects.toMatchObject({
      code: "AUTONOMY_LOOSENED",
      why: expect.stringContaining("no guard copy found") as unknown,
    });
  });

  it("reads the strictest setting when the manifest at HEAD has an owned-file list it cannot read", async ({ skip }) => {
    const root = tempDir().path("repo");
    const unreadable: unknown[] = [{ ledgar: [] }, { ledger: "files" }, { ledger: [{ path: 7 }] }, { ledger: [null] }];
    for (const [index, shape] of unreadable.entries()) {
      const repo = join(root, String(index));
      // oxlint-disable-next-line no-await-in-loop -- one repository per shape
      await put(repo, ".stamity/manifest.json", `${JSON.stringify({ version: "2.0.0", tools: ["claude"], ...(shape as object) })}\n`);
      // oxlint-disable-next-line no-await-in-loop -- one repository per shape
      await commitAll(repo, skip);
      // oxlint-disable-next-line no-await-in-loop -- one repository per shape
      expect(await readBaseline(repo, [CLAUDE_COPY]), JSON.stringify(shape)).toEqual(setting({ mode: "ask", deployingActs: [...DEPLOYING_ACTS] }));
    }
  });
});

/** One git call in `root` under the fixtures' isolated config: a local write (an object, a replace ref) that needs no commit. */
function git(root: string, args: readonly string[], input?: string): string {
  const env = { ...carriedProcessEnv(), GIT_CONFIG_GLOBAL: NO_GIT_CONFIG, GIT_CONFIG_NOSYSTEM: "1", HOME: root };
  return execFileSync("git", args, { cwd: root, env, encoding: "utf8", ...(input === undefined ? {} : { input }) }).trim();
}

/** Points a replace ref from the blob `HEAD` holds at `path` to a new blob holding `text`. */
function replaceBlobAtHead(root: string, path: string, text: string): void {
  const original = git(root, ["rev-parse", `HEAD:${path}`]);
  const replacement = git(root, ["hash-object", "-w", "--stdin"], text);
  git(root, ["replace", "-f", original, replacement]);
}

describe("readBaseline — a replace ref does not change what HEAD holds (build/14)", () => {
  it("reads the manifest blob HEAD holds, not the one a replace ref points at", async ({ skip }) => {
    const root = tempDir().path("repo");
    await put(root, CLAUDE_COPY, guardText());
    await put(root, ".stamity/manifest.json", manifestText({ mode: "ask" }));
    await commitAll(root, skip);
    await put(root, ".stamity/manifest.json", manifestText());
    replaceBlobAtHead(root, ".stamity/manifest.json", manifestText());
    expect((await readBaseline(root, [CLAUDE_COPY])).mode).toBe("ask");
  });

  it("reads the manifest blob HEAD holds with `core.useReplaceRefs=true` in the repository's config (review/116)", async ({ skip }) => {
    const root = tempDir().path("repo");
    await put(root, CLAUDE_COPY, guardText());
    await put(root, ".stamity/manifest.json", manifestText({ mode: "ask" }));
    await commitAll(root, skip);
    git(root, ["config", "core.useReplaceRefs", "true"]);
    await put(root, ".stamity/manifest.json", manifestText());
    replaceBlobAtHead(root, ".stamity/manifest.json", manifestText());
    expect((await readBaseline(root, [CLAUDE_COPY])).mode).toBe("ask");
  });

  it.skipIf(process.platform === "win32")(
    "starts each of its three git reads with `-c core.useReplaceRefs=false`, which beats the repository's config on every git (review/116)",
    async ({ skip }) => {
      const root = tempDir().path("repo");
      await put(root, ".stamity/manifest.json", manifestText({ mode: "ask" }));
      await commitAll(root, skip);
      // A stand-in `git` first on PATH that logs its arguments, then runs the real git: the gate's own spawn, unchanged.
      const real = execFileSync("sh", ["-c", "command -v git"], { encoding: "utf8" }).trim();
      const bin = tempDir().path("fake-git-bin");
      const log = tempDir().path("git-args.log");
      await mkdir(bin, { recursive: true });
      await writeFile(join(bin, "git"), `#!/bin/sh\nprintf '%s\\n' "$*" >> '${log}'\nexec '${real}' "$@"\n`, "utf8");
      await chmod(join(bin, "git"), 0o755);
      const before = process.env["PATH"];
      process.env["PATH"] = `${bin}:${before ?? ""}`;
      try {
        expect((await readBaseline(root, [CLAUDE_COPY])).mode).toBe("ask");
      } finally {
        process.env["PATH"] = before;
      }
      const calls = (await readFile(log, "utf8")).split("\n").filter((line) => line !== "");
      for (const verb of ["rev-parse", "ls-tree", "cat-file"]) {
        const call = calls.find((line) => line.includes(` ${verb} `));
        expect(call, `${verb} in ${JSON.stringify(calls)}`).toBeDefined();
        expect(call?.startsWith("-c core.useReplaceRefs=false "), call).toBe(true);
      }
    },
  );

  it("reads the guard copy blob HEAD holds, not the one a replace ref points at", async ({ skip }) => {
    const root = tempDir().path("repo");
    await put(root, CLAUDE_COPY, guardText({ mode: "ask", deployingBranches: ["production"] }));
    await put(root, ".stamity/manifest.json", manifestText());
    await commitAll(root, skip);
    await rm(join(root, CLAUDE_COPY));
    replaceBlobAtHead(root, CLAUDE_COPY, guardText());
    expect(await readBaseline(root, [CLAUDE_COPY])).toEqual(setting({ mode: "ask", deployingBranches: ["production"] }));
  });
});

describe("readBaseline — a git that refuses the repository reads as the strictest setting (review/57, review/66)", () => {
  it("reads strictest when git refuses an unparseable config, with the copies deleted and a looser manifest on disk", async ({ skip }) => {
    const root = tempDir().path("repo");
    await put(root, CLAUDE_COPY, guardText({ mode: "ask" }));
    await put(root, ".stamity/manifest.json", manifestText({ mode: "ask" }));
    await commitAll(root, skip);
    await rm(join(root, CLAUDE_COPY));
    await put(root, ".stamity/manifest.json", manifestText());
    await breakGitConfig(root);
    expect(await readBaseline(root, [CLAUDE_COPY])).toEqual(setting({ mode: "ask", deployingActs: [...DEPLOYING_ACTS] }));
    await expect(assertNotLoosened(root, setting(), { loosen: false, copies: CLAUDE_ONLY })).rejects.toMatchObject({
      code: "AUTONOMY_LOOSENED",
      why: expect.stringContaining("`HEAD`, which git did not answer for") as unknown,
    });
  });

  it("reads strictest when git refuses the repository even with a copy on disk", async ({ skip }) => {
    const root = tempDir().path("repo");
    await put(root, CLAUDE_COPY, guardText());
    await put(root, ".stamity/manifest.json", manifestText());
    await commitAll(root, skip);
    await breakGitConfig(root);
    expect((await readBaseline(root, [CLAUDE_COPY])).deploying).toEqual([...DEPLOYING_ACTS]);
  });

  it("puts no HEAD leg on an unborn branch: git's own answer that HEAD names no commit", async ({ skip }) => {
    const root = tempDir().path("repo");
    await put(root, "history-only.txt", "history\n");
    await commitAll(root, skip);
    // Point HEAD at a branch with no commit yet, as `git checkout --orphan` leaves it.
    await writeFile(join(root, ".git", "HEAD"), "ref: refs/heads/nothing-yet\n", "utf8");
    await put(root, CLAUDE_COPY, guardText());
    expect(await readBaseline(root, [CLAUDE_COPY])).toEqual(setting());
  });
});

describe("assertNotLoosened — the refusal names the leg that decided (review/59)", () => {
  async function refusalWhy(root: string): Promise<string> {
    const refusal = await assertNotLoosened(root, setting(), { loosen: false, copies: CLAUDE_ONLY }).then(
      () => null,
      (error: unknown) => error,
    );
    expect(refusal).toBeInstanceOf(EngineError);
    return (refusal as EngineError).why ?? "";
  }

  it("names the guard copy on disk", async () => {
    const root = tempDir().path("repo");
    await put(root, CLAUDE_COPY, guardText({ mode: "ask" }));
    const why = await refusalWhy(root);
    expect(why).toContain(`the guard copy \`${CLAUDE_COPY}\` on disk`);
    expect(why).not.toContain("HEAD");
    expect(why).not.toContain("manifest");
  });

  it("names the manifest on disk", async () => {
    const root = tempDir().path("repo");
    await put(root, CLAUDE_COPY, guardText());
    await put(root, ".stamity/manifest.json", manifestText({ mode: "ask" }));
    const why = await refusalWhy(root);
    expect(why).toContain("the manifest on disk");
    expect(why).not.toContain("guard copy");
  });

  it("names the setting committed at HEAD", async ({ skip }) => {
    const root = tempDir().path("repo");
    await put(root, CLAUDE_COPY, guardText());
    await put(root, ".stamity/manifest.json", manifestText({ mode: "ask" }));
    await commitAll(root, skip);
    await put(root, ".stamity/manifest.json", manifestText());
    expect(await refusalWhy(root)).toBe("the setting committed at `HEAD` is stricter, and loosening it is the person's act");
  });

  it("says no guard copy was found, naming no file, when none is on disk or at HEAD", async ({ skip }) => {
    const root = tempDir().path("repo");
    await put(root, ".stamity/manifest.json", manifestText());
    await commitAll(root, skip);
    const why = await refusalWhy(root);
    expect(why).toContain("no guard copy found on disk or at `HEAD`");
    expect(why).not.toContain(CLAUDE_COPY);
    expect(why).not.toContain("the guard on disk");
  });
});

describe("assertNotLoosened — a --loosen write names what it loosened (review/67)", () => {
  it("hands one line per guard copy it loosens: the mode from → to, and each act or branch dropped", async () => {
    const root = tempDir().path("repo");
    const other = GUARD_COPY_PATHS[1] ?? "";
    await put(root, CLAUDE_COPY, guardText({ mode: "ask", deployingBranches: ["production"] }));
    const lines: string[] = [];
    await assertNotLoosened(root, setting(), {
      loosen: true,
      copies: { planned: [CLAUDE_COPY, other], baking: [CLAUDE_COPY, other] },
      notice: (line) => lines.push(line),
    });
    expect(lines).toEqual(
      [CLAUDE_COPY, other].map(
        (path) =>
          `loosened \`${path}\` with --loosen: mode \`ask\` → \`autonomous\`; \`pr-ready\` now runs unasked; \`tag\` now runs unasked; the deploying branch "production" is no longer named`,
      ),
    );
  });

  it("names nothing when the --loosen write loosens nothing", async () => {
    const root = tempDir().path("repo");
    await put(root, CLAUDE_COPY, guardText());
    const lines: string[] = [];
    await assertNotLoosened(root, setting({ mode: "ask" }), { loosen: true, copies: CLAUDE_ONLY, notice: (line) => lines.push(line) });
    expect(lines).toEqual([]);
  });
});

describe("guardCopySetting — a copy with no marker (decision D6)", () => {
  it("reads a copy of this release whose marker line was removed as `ask`", () => {
    const stripped = withoutMarker(guardText());
    expect(stripped).not.toContain(MARKER);
    expect(guardCopySetting(stripped).mode).toBe("ask");
  });

  it("keeps the deploying branch the baked constant still names when the marker was removed", () => {
    const stripped = withoutMarker(guardText({ deployingBranches: ["release/*"] }));
    const read = guardCopySetting(stripped);
    expect(read.mode).toBe("ask");
    expect(read.deployingBranches).toEqual(["release/*"]);
  });

  it("reads a copy of this release with the marker and the baked constant removed, the banner kept, as `ask`", () => {
    const stripped = withoutMarker(guardText())
      .split("\n")
      .filter((line) => !line.startsWith("const AUTONOMY = "))
      .join("\n");
    expect(guardCopySetting(stripped).mode).toBe("ask");
  });

  it("reads a 1.16.0-shaped copy, with none of this release's guard text, as the upgrade default", () => {
    // TEST CHANGE, justified: REQ-FLOW-138 — a 1.16.0 copy is now recognised by its title and inlined verdict (review/65); the fixture carries the verdict line 1.16.0's copy has.
    const old = [
      "#!/usr/bin/env node",
      "/* eslint-disable */",
      "// stamity — person-only shell guard.",
      "// Generated file — regenerate it rather than editing; local edits are overwritten.",
      'const STATE_SEGMENTS = [".stamity"];',
      "const personOnlyVerdict = function personOnlyVerdict(command) { return command; };",
      "",
    ].join("\n");
    expect(guardCopySetting(old)).toEqual(setting());
  });

  it("reads a copy whose marker alone was rewritten looser by the baked constant it still enforces", () => {
    const rewritten = withMarkerOf(guardText({ mode: "ask" }), guardText());
    expect(rewritten).toContain('// stamity-autonomy {"mode":"autonomous"');
    expect(guardCopySetting(rewritten).mode).toBe("ask");
  });

  it("reads the marker itself when one is there", () => {
    expect(guardCopySetting(guardText({ deployingActs: ["tag"] }))).toEqual(setting({ deployingActs: ["tag"] }));
  });
});

describe("assertNotLoosened — the refusal", () => {
  it("refuses a looser setting with AUTONOMY_LOOSENED naming what loosens and the person's command", async () => {
    const root = tempDir().path("repo");
    await put(root, CLAUDE_COPY, guardText({ mode: "ask", deployingBranches: ["production"] }));
    // TEST CHANGE, justified: REQ-FLOW-138 — the gate now takes the planned guard copies it reads (review/65).
    const refusal = await assertNotLoosened(root, setting(), { loosen: false, copies: CLAUDE_ONLY, remedy: "stamity sync --loosen" }).then(
      () => null,
      (error: unknown) => error,
    );
    expect(refusal).toBeInstanceOf(EngineError);
    const error = refusal as EngineError;
    expect(error.code).toBe("AUTONOMY_LOOSENED");
    expect(error.message).toContain("mode `autonomous` over `ask`");
    expect(error.message).toContain("`pr-ready` would run unasked");
    expect(error.message).toContain('the deploying branch "production" would no longer be named');
    expect(error.next).toBe("the person runs `stamity sync --loosen`");
    expect(error.why).toContain("stricter");
  });

  it("lets the same looser setting through with `loosen`, and a tighter one through without it", async () => {
    const root = tempDir().path("repo");
    await put(root, CLAUDE_COPY, guardText({ mode: "ask" }));
    // TEST CHANGE, justified: REQ-FLOW-138 — the gate now takes the planned guard copies it reads (review/65).
    await expect(assertNotLoosened(root, setting(), { loosen: true, copies: CLAUDE_ONLY })).resolves.toBeUndefined();
    await put(root, CLAUDE_COPY, guardText());
    await expect(assertNotLoosened(root, setting({ mode: "ask" }), { loosen: false, copies: CLAUDE_ONLY })).resolves.toBeUndefined();
  });

  it("refuses dropping `workflow-dispatch` from the deploying acts", async () => {
    const root = tempDir().path("repo");
    await put(root, CLAUDE_COPY, guardText({ deployingActs: ["workflow-dispatch"] }));
    // TEST CHANGE, justified: REQ-FLOW-138 — the gate now takes the planned guard copies it reads (review/65).
    await expect(assertNotLoosened(root, setting(), { loosen: false, copies: CLAUDE_ONLY })).rejects.toMatchObject({
      code: "AUTONOMY_LOOSENED",
      message: expect.stringContaining("`workflow-dispatch` would no longer be named as deploying") as unknown,
    });
  });

  it("is a substantive failure: a retry bakes the same looser guard", () => {
    expect(classifyFailure(new EngineError("looser", { code: "AUTONOMY_LOOSENED" }))).toBe("substantive");
  });
});

describe("gateGuardCopies — only a guard copy whose marker changes is gated", () => {
  function recordingGate(): { gate: GuardGate; seen: ResolvedAutonomy[] } {
    const seen: ResolvedAutonomy[] = [];
    return {
      seen,
      gate: async (next) => {
        // TEST CHANGE, justified: REQ-FLOW-138 — GuardGate also takes the copies (review/65, review/67); this recorder reads only the setting.
        seen.push(next);
      },
    };
  }

  it("asks nothing for a recorded copy whose marker is the one on disk, or for an output that is no guard copy", async () => {
    const root = tempDir().path("repo");
    const onDisk = guardText({ mode: "ask" });
    await put(root, CLAUDE_COPY, onDisk);
    const { gate, seen } = recordingGate();
    await gateGuardCopies(
      root,
      [
        // The body changed, the marker did not: a write that does not change the setting needs no gate.
        { path: CLAUDE_COPY, content: `${onDisk}\n// a later body\n` },
        // TEST CHANGE, justified: REQ-FLOW-138 — a planned output name no tracked file has, so the test-input guard reads no repository file here (it was red on a38c554a).
        { path: "not-a-guard.md", content: `${MARKER}{"mode":"autonomous"}\n` },
      ],
      [recordedRow(CLAUDE_COPY, onDisk)],
      gate,
    );
    expect(seen).toEqual([]);
  });

  it("gates re-writing a copy edited by hand since the ledger recorded it, its marker matching the plan", async () => {
    const root = tempDir().path("repo");
    const written = guardText({ mode: "ask" });
    // Marker and constant both edited to the looser value the plan now bakes.
    const edited = guardText();
    await put(root, CLAUDE_COPY, edited);
    const { gate, seen } = recordingGate();
    await gateGuardCopies(root, [{ path: CLAUDE_COPY, content: guardText() }], [recordedRow(CLAUDE_COPY, written)], gate);
    expect(seen).toEqual([setting()]);
  });

  it("gates a changed marker, an absent copy and a copy with no marker, once per distinct setting", async () => {
    const root = tempDir().path("repo");
    await put(root, CLAUDE_COPY, guardText({ mode: "ask" }));
    const { gate, seen } = recordingGate();
    await gateGuardCopies(
      root,
      [
        { path: CLAUDE_COPY, content: guardText() },
        { path: GUARD_COPY_PATHS[1] ?? "", content: guardText() },
        { path: GUARD_COPY_PATHS[2] ?? "", content: guardText({ deployingActs: ["tag"] }) },
        { path: GUARD_COPY_PATHS[3] ?? "", content: withoutMarker(guardText({ mode: "ask" })) },
      ],
      [recordedRow(CLAUDE_COPY, guardText({ mode: "ask" }))],
      gate,
    );
    // The default twice (a changed marker, an absent copy; a marker-less planned copy reads as it) and `tag` once.
    expect(seen).toEqual([setting(), setting({ deployingActs: ["tag"] })]);
  });

  it("gates a copy whose marker was rewritten to the planned one while its baked constant differs", async () => {
    const root = tempDir().path("repo");
    await put(root, CLAUDE_COPY, withMarkerOf(guardText({ mode: "ask" }), guardText()));
    const { gate, seen } = recordingGate();
    await gateGuardCopies(root, [{ path: CLAUDE_COPY, content: guardText() }], [], gate);
    expect(seen).toEqual([setting()]);
    // And the baseline that copy gives refuses the write.
    // TEST CHANGE, justified: REQ-FLOW-138 — the gate now takes the planned guard copies it reads (review/65).
    await expect(assertNotLoosened(root, setting(), { loosen: false, copies: CLAUDE_ONLY })).rejects.toMatchObject({ code: "AUTONOMY_LOOSENED" });
  });

  it("hands the gate every planned guard path and the ones baking the setting asked about (review/65, review/67)", async () => {
    const root = tempDir().path("repo");
    const calls: [ResolvedAutonomy, GuardCopies][] = [];
    const tagged = GUARD_COPY_PATHS[2] ?? "";
    await gateGuardCopies(
      root,
      [
        { path: CLAUDE_COPY, content: guardText() },
        { path: "not-a-guard.txt", content: "not a guard\n" },
        { path: GUARD_COPY_PATHS[1] ?? "", content: guardText() },
        { path: tagged, content: guardText({ deployingActs: ["tag"] }) },
      ],
      [],
      async (next, copies) => {
        calls.push([next, copies]);
      },
    );
    const planned = [CLAUDE_COPY, GUARD_COPY_PATHS[1] ?? "", tagged];
    expect(calls).toEqual([
      [setting(), { planned, baking: [CLAUDE_COPY, GUARD_COPY_PATHS[1] ?? ""] }],
      [setting({ deployingActs: ["tag"] }), { planned, baking: [tagged] }],
    ]);
  });

  it("stops at the first refusal and lets it through unchanged", async () => {
    const root = tempDir().path("repo");
    const refusal = new EngineError("no", { code: "AUTONOMY_LOOSENED" });
    await expect(
      gateGuardCopies(root, [{ path: CLAUDE_COPY, content: guardText() }], [], () => Promise.reject(refusal)),
    ).rejects.toBe(refusal);
  });
});

// ── The census (criterion 8) ───────────────────────────────────────────────

/** Every source file under `src/`, by POSIX path from the repository root. */
async function sourceFiles(): Promise<Map<string, string>> {
  const repoRoot = join(import.meta.dirname, "..", "..", "..");
  const found = new Map<string, string>();
  async function walk(dir: string): Promise<void> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      // oxlint-disable-next-line no-await-in-loop -- a bounded tree walk
      if (entry.isDirectory()) await walk(path);
      else if (entry.name.endsWith(".ts")) {
        // oxlint-disable-next-line no-await-in-loop -- a bounded tree walk
        found.set(relative(repoRoot, path).split(sep).join("/"), await readFile(path, "utf8"));
      }
    }
  }
  await walk(join(repoRoot, "src"));
  return found;
}

/** The argument text of every call of `name(` in `text` outside a comment line, to its matching `)`. */
function callArguments(text: string, name: string): string[] {
  const calls: string[] = [];
  const pattern = new RegExp(`\\b${name}\\(`, "g");
  for (const match of text.matchAll(pattern)) {
    const lineStart = text.lastIndexOf("\n", match.index) + 1;
    const lead = text.slice(lineStart, match.index).trim();
    if (lead.startsWith("*") || lead.startsWith("//") || lead.startsWith("/*")) continue;
    if (/\bfunction\s*$/.test(text.slice(lineStart, match.index))) continue;
    let depth = 0;
    let end = match.index + match[0].length - 1;
    for (; end < text.length; end += 1) {
      if (text[end] === "(") depth += 1;
      else if (text[end] === ")") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    calls.push(text.slice(match.index, end + 1));
  }
  return calls;
}

/** How a command reads its own `--loosen` flag into a boolean. */
const FLAG_READ = 'opts["loosen"] === true';

/**
 * Where a gate's `loosen` value comes from, or `null` when it is not the
 * command's own `--loosen` flag: written in place as {@link FLAG_READ}; the
 * shorthand `loosen` of a `const loosen = <FLAG_READ>` in the same file; or
 * `opts.loosen` in a file that hands {@link FLAG_READ} on as `loosen:` (the
 * workspace bridge). Any literal, or any other expression, is `null`.
 */
function loosenSource(call: string, text: string): string | null {
  const gate = callArguments(call, "assertNotLoosened")[0] ?? "";
  const value = /\bloosen(?:\s*:\s*([^,}\n]+?))?\s*[,}\n]/.exec(gate.slice(gate.indexOf("{")));
  if (value === null) return null;
  const expression = (value[1] ?? "loosen").trim();
  if (expression === FLAG_READ) return expression;
  if (expression === "loosen") return text.includes(`const loosen = ${FLAG_READ};`) ? expression : null;
  if (expression === "opts.loosen") return text.includes(`loosen: ${FLAG_READ}`) ? expression : null;
  return null;
}

/**
 * The census rule: every call of `applySync` or `applyInit` either passes a
 * `guardGate` built on `assertNotLoosened` or passes none, and so takes the
 * loop's strict default. A call passing some other gate is named, and so is
 * one whose `loosen` is not read from its command's own `--loosen` flag (a
 * literal `true` lets every loosening through, review/62), or whose file
 * declares no `--loosen` option. The two loops themselves must keep the
 * strict default.
 */
function censusFindings(files: ReadonlyMap<string, string>): string[] {
  const findings: string[] = [];
  for (const [path, text] of files) {
    for (const loop of ["applySync", "applyInit"]) {
      for (const call of callArguments(text, loop)) {
        if (!call.includes("guardGate")) continue;
        if (!/guardGate:\s*\(next, copies\)\s*=>\s*assertNotLoosened\(/.test(call)) {
          findings.push(`${path}: ${loop} passes a gate not built on assertNotLoosened`);
          continue;
        }
        if (loosenSource(call, text) === null) findings.push(`${path}: ${loop} passes a gate whose loosen is not the command's --loosen flag`);
        if (!/\.option\(\s*"--loosen"/.test(text)) findings.push(`${path}: ${loop} passes a gate but the command declares no --loosen option`);
      }
    }
  }
  for (const loop of ["src/cli/commands/sync/engine.ts", "src/cli/commands/init/apply.ts"]) {
    if (!(files.get(loop) ?? "").includes("opts.guardGate ?? strictGuardGate(")) findings.push(`${loop}: no strict default gate`);
  }
  return findings;
}

/** Who calls the two loops today, and with which gate: a new caller is named here before it ships. */
const LOOP_CALLERS: Readonly<Record<string, "gate" | "strict default">> = {
  "src/cli/commands/sync.ts": "gate",
  "src/cli/commands/init.ts": "gate",
  "src/cli/commands/workspace.ts": "gate",
};

describe("census — every caller of the two write loops passes the gate or takes the strict default", () => {
  it("holds over src/, and the callers are exactly the ones listed", async () => {
    const files = await sourceFiles();
    expect(censusFindings(files)).toEqual([]);
    const callers = [...files]
      .filter(([, text]) => callArguments(text, "applySync").length + callArguments(text, "applyInit").length > 0)
      .map(([path]) => path)
      .filter((path) => path !== "src/cli/commands/sync/engine.ts" && path !== "src/cli/commands/init/apply.ts")
      .toSorted();
    expect(callers).toEqual(Object.keys(LOOP_CALLERS).toSorted());
    for (const [path, kind] of Object.entries(LOOP_CALLERS)) {
      const passes = [...callArguments(files.get(path) ?? "", "applySync"), ...callArguments(files.get(path) ?? "", "applyInit")].every(
        (call) => call.includes("guardGate"),
      );
      expect(passes, path).toBe(kind === "gate");
    }
  });

  it("reads each caller's loosen from its own --loosen flag (review/62)", async () => {
    const files = await sourceFiles();
    const sources = Object.keys(LOOP_CALLERS).map((path) => {
      const text = files.get(path) ?? "";
      const calls = [...callArguments(text, "applySync"), ...callArguments(text, "applyInit")];
      return [path, calls.map((call) => loosenSource(call, text))];
    });
    expect(Object.fromEntries(sources)).toEqual({
      "src/cli/commands/sync.ts": ["loosen"],
      "src/cli/commands/init.ts": [FLAG_READ],
      "src/cli/commands/workspace.ts": ["opts.loosen"],
    });
  });

  it("fails on a caller whose gate passes a literal loosen, or one with no --loosen option", async () => {
    const files = new Map(await sourceFiles());
    files.set(
      "src/cli/commands/upgrade.ts",
      [
        'cmd.option("--loosen", "…");',
        "await applySync(root, plan, { engineVersion, force, dryRun, guardGate: (next, copies) => assertNotLoosened(root, next, { loosen: true, copies }) });",
        "",
      ].join("\n"),
    );
    files.set(
      "src/cli/commands/other.ts",
      'const loosen = opts["loosen"] === true;\nawait applyInit({ guardGate: (next, copies) => assertNotLoosened(root, next, { loosen, copies }) });\n',
    );
    expect(censusFindings(files)).toEqual([
      "src/cli/commands/upgrade.ts: applySync passes a gate whose loosen is not the command's --loosen flag",
      "src/cli/commands/other.ts: applyInit passes a gate but the command declares no --loosen option",
    ]);
  });

  it("fails on a caller that passes a gate letting everything through, and on a loop that drops its default", async () => {
    const files = new Map(await sourceFiles());
    files.set(
      "src/cli/commands/upgrade.ts",
      "await applySync(root, plan, { engineVersion, force, dryRun, guardGate: async () => {} });\n",
    );
    files.set("src/cli/commands/init/apply.ts", "export async function applyInit(opts) { return opts; }\n");
    expect(censusFindings(files)).toEqual([
      "src/cli/commands/upgrade.ts: applySync passes a gate not built on assertNotLoosened",
      "src/cli/commands/init/apply.ts: no strict default gate",
    ]);
  });
});
