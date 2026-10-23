import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import {
  GUARD_COPY_PATHS,
  assertNotLoosened,
  gateGuardCopies,
  guardCopySetting,
  readBaseline,
  type GuardGate,
} from "../../../src/cli/engine/autonomyGate.ts";
import { resolveAutonomy, type ResolvedAutonomy } from "../../../src/config/autonomy.ts";
import { buildPersonOnlyGuardScript } from "../../../src/hooks/scripts.ts";
import { classifyFailure } from "../../../src/resilience/failureClass.ts";
import { DEPLOYING_ACTS, type AutonomyConfig } from "../../../src/types/manifest.ts";
import { EngineError } from "../../../src/types/errors.ts";
import { seedGitRepo } from "../../support/repoFixtures.ts";
import { useTempDir } from "../../support/tempDir.ts";

/**
 * The loosen gate (REQ-FLOW-138, the CLI half): the baseline's three legs, the
 * refusal, the per-copy marker comparison the write loops run, and the census
 * of every caller of the two write loops. Real files and a real git throughout;
 * the guard copies are the guard builder's own output.
 */

const tempDir = useTempDir("stamity-autonomy-gate");

const CLAUDE_COPY = GUARD_COPY_PATHS[0] ?? "";
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

function manifestText(autonomy?: AutonomyConfig): string {
  return `${JSON.stringify({ version: "2.0.0", tools: ["claude"], ...(autonomy === undefined ? {} : { autonomy }) })}\n`;
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
    const root = tempDir().path("repo");
    await mkdir(root, { recursive: true });
    expect(await readBaseline(root)).toEqual(setting());
  });

  it("reads a guard copy's baked mode `ask`, and the strictest of two copies", async () => {
    const root = tempDir().path("repo");
    await put(root, CLAUDE_COPY, guardText());
    await put(root, GUARD_COPY_PATHS[1] ?? "", guardText({ mode: "ask", deployingBranches: ["production"] }));
    const baseline = await readBaseline(root);
    expect(baseline.mode).toBe("ask");
    expect(baseline.deployingBranches).toEqual(["production"]);
  });

  it("reads the manifest on disk before the write", async () => {
    const root = tempDir().path("repo");
    await put(root, CLAUDE_COPY, guardText());
    await put(root, ".stamity/manifest.json", manifestText({ deployingActs: ["workflow-dispatch"] }));
    expect((await readBaseline(root)).deploying).toEqual(["workflow-dispatch"]);
  });

  it("reads a manifest on disk that is not JSON as the strictest setting", async () => {
    const root = tempDir().path("repo");
    await put(root, CLAUDE_COPY, guardText());
    await put(root, ".stamity/manifest.json", "{ not json");
    expect(await readBaseline(root)).toEqual(setting({ mode: "ask", deployingActs: [...DEPLOYING_ACTS] }));
  });

  it.skipIf(process.platform === "win32")("reads a guard path holding a link as the strictest setting", async () => {
    const root = tempDir().path("repo");
    await put(root, "elsewhere.mjs", guardText());
    await mkdir(dirname(join(root, CLAUDE_COPY)), { recursive: true });
    await symlink(join(root, "elsewhere.mjs"), join(root, CLAUDE_COPY));
    expect(await readBaseline(root)).toEqual(setting({ mode: "ask", deployingActs: [...DEPLOYING_ACTS] }));
  });

  it("reads the autonomy committed at HEAD over a looser manifest on disk", async ({ skip }) => {
    const root = tempDir().path("repo");
    await put(root, CLAUDE_COPY, guardText());
    await put(root, ".stamity/manifest.json", manifestText({ mode: "ask" }));
    await commitAll(root, skip);
    await put(root, ".stamity/manifest.json", manifestText());
    expect((await readBaseline(root)).mode).toBe("ask");
  });

  it("reads `ask` when no guard copy is on disk while HEAD holds a manifest, even a looser one", async ({ skip }) => {
    const root = tempDir().path("repo");
    await put(root, CLAUDE_COPY, guardText({ mode: "ask" }));
    await put(root, ".stamity/manifest.json", manifestText());
    await commitAll(root, skip);
    // The copy is deleted from disk; HEAD still holds it and the manifest.
    await rm(join(root, CLAUDE_COPY));
    expect((await readBaseline(root)).mode).toBe("ask");
  });

  it("puts no HEAD leg where HEAD holds no manifest", async ({ skip }) => {
    const root = tempDir().path("repo");
    await put(root, "README.md", "a repository with history and no setup\n");
    await commitAll(root, skip);
    expect(await readBaseline(root)).toEqual(setting());
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
    const old = [
      "#!/usr/bin/env node",
      "/* eslint-disable */",
      "// stamity — person-only shell guard.",
      "// Generated file — regenerate it rather than editing; local edits are overwritten.",
      'const STATE_SEGMENTS = [".stamity"];',
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
    const refusal = await assertNotLoosened(root, setting(), { loosen: false, remedy: "stamity sync --loosen" }).then(
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
    await expect(assertNotLoosened(root, setting(), { loosen: true })).resolves.toBeUndefined();
    await put(root, CLAUDE_COPY, guardText());
    await expect(assertNotLoosened(root, setting({ mode: "ask" }), { loosen: false })).resolves.toBeUndefined();
  });

  it("refuses dropping `workflow-dispatch` from the deploying acts", async () => {
    const root = tempDir().path("repo");
    await put(root, CLAUDE_COPY, guardText({ deployingActs: ["workflow-dispatch"] }));
    await expect(assertNotLoosened(root, setting(), { loosen: false })).rejects.toMatchObject({
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
        { path: "AGENTS.md", content: `${MARKER}{"mode":"autonomous"}\n` },
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
    await expect(assertNotLoosened(root, setting(), { loosen: false })).rejects.toMatchObject({ code: "AUTONOMY_LOOSENED" });
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

/**
 * The census rule: every call of `applySync` or `applyInit` either passes a
 * `guardGate` built on `assertNotLoosened` or passes none, and so takes the
 * loop's strict default. A call passing some other gate is named. The two
 * loops themselves must keep the strict default.
 */
function censusFindings(files: ReadonlyMap<string, string>): string[] {
  const findings: string[] = [];
  for (const [path, text] of files) {
    for (const loop of ["applySync", "applyInit"]) {
      for (const call of callArguments(text, loop)) {
        if (!call.includes("guardGate")) continue;
        if (!/guardGate:\s*\(next\)\s*=>\s*assertNotLoosened\(/.test(call)) findings.push(`${path}: ${loop} passes a gate not built on assertNotLoosened`);
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
