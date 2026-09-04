import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  currentGitRef,
  handoffCommand,
  handoffSlug,
  recordedBranch,
} from "../../../src/cli/commands/handoff.ts";
import { composeFrontmatter } from "../../../src/content/frontmatter.ts";
import { DEFAULT_ARCHIVE_RETENTION_DAYS, readHandoff } from "../../../src/handoffs/store.ts";
import {
  MAX_HANDOFF_BODY_BYTES,
  MAX_SUMMARY_LENGTH,
  computeHandoffIntegrity,
  verifyHandoffIntegrity,
} from "../../../src/handoffs/validation.ts";
import { MANIFEST_VERSION, type SetupManifest } from "../../../src/types/manifest.ts";
import { STATE_DIR } from "../../../src/types/markers.ts";
import { runInProcess } from "../../support/inProcess.ts";
import { seedGitRepo } from "../../support/repoFixtures.ts";
import { useTempDir, type TempDirHandle } from "../../support/tempDir.ts";

/**
 * Real-filesystem lane, for the reason `learn.test.ts` uses one: the verb's
 * contract is what lands under `.stamity/handoffs/` and whether the engine
 * reads it back, neither of which is expressible on a virtual volume the
 * command never sees.
 *
 * Everything runs through the in-process funnel, so each assertion also covers
 * the seams the UX contract lives in — exit 0/1/2, the single JSON document,
 * `--dry-run` plumbing, and stdin arriving as the injected prompt stream.
 *
 * Expiry dates are pinned far out (2098/2099) rather than computed from the
 * ambient clock: the funnel injects no clock, so a fixture that expires
 * "soon enough" would be a suite that goes red on a calendar date.
 */

const tempDir = useTempDir("stamity-handoff");

const HANDOFFS_DIR = `${STATE_DIR}/handoffs`;
const TITLE = "closure run execution";
const SUMMARY = "Pick up the closure run at the handoff verb.";

/** The eight sections the engine requires, and nothing a screen fires on. */
const BODY = [
  "## Problem",
  "",
  "The handoff mechanics live in a skill body an agent runs by hand.",
  "",
  "## Decisions",
  "",
  "Quote the engine's verdicts rather than re-deriving them.",
  "",
  "## Work Done",
  "",
  "src/cli/commands/handoff.ts carries the three modes.",
  "",
  "## Work Remaining",
  "",
  "Move the surface pins in the following unit.",
  "",
  "## Blockers",
  "",
  "None",
  "",
  "## Next Steps",
  "",
  "Run the gates, then hand the pins over.",
  "",
  "## Build & Test Status",
  "",
  "typecheck, green, no diagnostics.",
  "",
  "## File Manifest",
  "",
  "src/cli/commands/handoff.ts, added, written.",
].join("\n");

function manifestFixture(): SetupManifest {
  return {
    version: MANIFEST_VERSION,
    generatedBy: "0.0.0",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    tools: ["claude"],
    selection: { items: { agent: [], skill: [], rule: [], command: [] } },
    ledger: [],
  };
}

/** An initialised repo with no handoffs directory — the store creates its own. */
async function seedRepo(temp: TempDirHandle, extra: Record<string, string> = {}): Promise<string> {
  await temp.seedFiles({
    "repo/README.md": "# fixture\n",
    [`repo/${STATE_DIR}/manifest.json`]: `${JSON.stringify(manifestFixture(), null, 2)}\n`,
    ...extra,
  });
  return temp.path("repo");
}

/** A hand-written handoff document, digest-stamped unless the case overrides it. */
function handoffDoc(opts: {
  id: string;
  expires: string;
  status?: string;
  summary?: string;
  body?: string;
  gitRef?: string;
  integrity?: string;
}): string {
  const body = `${(opts.body ?? BODY).trim()}\n`;
  const summary = opts.summary ?? SUMMARY;
  return composeFrontmatter(
    {
      id: opts.id,
      status: opts.status ?? "active",
      created: "2026-01-01T00:00:00.000Z",
      expires: opts.expires,
      summary,
      fromTool: "claude",
      gitRef: opts.gitRef,
      integrity: opts.integrity ?? computeHandoffIntegrity(summary, body),
    },
    body,
  );
}

/** Hostile defaults: no TTY anywhere, empty env, stdin closed unless seeded. */
function runHandoff(
  root: string,
  argv: readonly string[],
  stdin?: string,
): ReturnType<typeof runInProcess> {
  return runInProcess([handoffCommand], ["handoff", ...argv], {
    cwd: root,
    ...(stdin === undefined ? {} : { stdinLines: [stdin] }),
  });
}

/** `handoff prepare` with the standard title, summary and tool. */
function prepare(
  root: string,
  argv: readonly string[] = [],
  stdin: string | undefined = BODY,
): ReturnType<typeof runInProcess> {
  return runHandoff(
    root,
    ["prepare", "--title", TITLE, "--summary", SUMMARY, "--from-tool", "claude", ...argv],
    stdin,
  );
}

function parseSingleDoc(stdout: string): Record<string, unknown> {
  const lines = stdout.split("\n").filter((line) => line !== "");
  expect(lines).toHaveLength(1);
  return JSON.parse(lines[0] ?? "") as Record<string, unknown>;
}

/** Prepare through `--json` and hand back the id the store minted. */
async function prepareId(root: string, argv: readonly string[] = []): Promise<string> {
  const result = await prepare(root, ["--json", ...argv]);
  expect(result.code).toBe(0);
  return String(parseSingleDoc(result.stdout)["id"]);
}

/** Seed a git repo, or skip: a machine without git cannot answer a drift question. */
async function seedGitOrSkip(root: string, skip: () => void): Promise<void> {
  try {
    await seedGitRepo(root);
  } catch (error) {
    if (error instanceof Error && error.name === "GitUnavailableError") skip();
    else throw error;
  }
}

describe("handoff slug and ref helpers", () => {
  it("applies the same minimal slug transform learn does", () => {
    expect(handoffSlug("  Closure   Run Execution ")).toBe("closure-run-execution");
    // Minimal on purpose: punctuation survives, and the engine's own id
    // normalizer is what turns it into a name, so nothing is laundered here.
    expect(handoffSlug("../../etc/passwd")).toBe("../../etc/passwd");
  });

  it("reads the branch half of a recorded ref, and nothing when there is none", () => {
    expect(recordedBranch("feature/a@abc1234")).toBe("feature/a");
    expect(recordedBranch("@abc1234")).toBeNull();
  });
});

describe("handoff prepare", () => {
  it("writes a handoff the engine reads back with its digest verified", async () => {
    const temp = tempDir();
    const root = await seedRepo(temp);

    const result = await prepare(root, ["--json", "--to-tool", "cursor"]);

    expect(result.code).toBe(0);
    const doc = parseSingleDoc(result.stdout);
    const id = String(doc["id"]);
    const stored = await readHandoff(root, id);
    expect(stored).not.toBeNull();
    expect(verifyHandoffIntegrity(stored!)).toBe(true);
    expect(stored!.frontmatter.status).toBe("active");
    expect(stored!.frontmatter.fromTool).toBe("claude");
    expect(stored!.frontmatter.toTool).toBe("cursor");
    expect(stored!.body).toContain("The handoff mechanics live in a skill body");
    // The record the machine caller reads is the head the store stamped.
    expect(doc["handoff"]).toMatchObject({ id, status: "active", summary: SUMMARY });
  });

  it("prints the path on the human surface, and warns when no git ref resolves", async () => {
    const temp = tempDir();
    const root = await seedRepo(temp);

    const result = await prepare(root);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Prepared ");
    expect(result.stdout).toContain(join(root, HANDOFFS_DIR));
    // The warning is owed exactly when git could not name a ref here, so the
    // assertion asks git the same question the command did.
    expect(result.stderr.includes("no git ref could be resolved")).toBe(
      currentGitRef(root) === null,
    );
  });

  it("records the ref the flag names instead of probing git", async () => {
    const temp = tempDir();
    const root = await seedRepo(temp);

    const id = await prepareId(root, ["--git-ref", "closure-run@6865e31"]);

    expect((await readHandoff(root, id))?.frontmatter.gitRef).toBe("closure-run@6865e31");
  });

  it("refuses a body missing one of the eight required sections, naming it", async () => {
    const temp = tempDir();
    const root = await seedRepo(temp);
    const withoutBlockers = BODY.replace("## Blockers", "## Notes");

    const result = await prepare(root, [], withoutBlockers);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('missing required section(s) "## Blockers"');
  });

  it("refuses a body over the engine's byte cap", async () => {
    const temp = tempDir();
    const root = await seedRepo(temp);

    const result = await prepare(root, [], `${BODY}\n${"a".repeat(MAX_HANDOFF_BODY_BYTES)}`);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain(`over the ${MAX_HANDOFF_BODY_BYTES} byte limit`);
  });

  it("refuses a summary over the cap, which the read side only warns about", async () => {
    const temp = tempDir();
    const root = await seedRepo(temp);
    const long = "s".repeat(MAX_SUMMARY_LENGTH + 1);

    const result = await runHandoff(
      root,
      ["prepare", "--title", TITLE, "--summary", long, "--from-tool", "claude", "--json"],
      BODY,
    );

    expect(result.code).toBe(1);
    const doc = parseSingleDoc(result.stdout);
    expect(doc["ok"]).toBe(false);
    expect(String((doc["errors"] as string[])[0])).toContain(`over ${MAX_SUMMARY_LENGTH}`);
  });

  it("refuses when a required flag for the mode is absent", async () => {
    const temp = tempDir();
    const root = await seedRepo(temp);

    const result = await runHandoff(root, ["prepare", "--title", TITLE], BODY);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("--summary");
  });

  it("runs the gates and writes nothing under --dry-run", async () => {
    const temp = tempDir();
    const root = await seedRepo(temp);

    const result = await prepare(root, ["--dry-run"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Nothing was written");
    await expect(readFile(join(root, HANDOFFS_DIR), "utf8")).rejects.toThrow();
  });

  it("refuses under --dry-run for the same reason the write would", async () => {
    const temp = tempDir();
    const root = await seedRepo(temp);

    const result = await prepare(root, ["--dry-run"], BODY.replace("## Blockers", "## Notes"));

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('missing required section(s) "## Blockers"');
  });
});

describe("handoff resume", () => {
  it("prints the trust frame and advances the status without moving the digest", async () => {
    const temp = tempDir();
    const root = await seedRepo(temp);
    const id = await prepareId(root);
    const before = await readHandoff(root, id);

    const result = await runHandoff(root, ["resume", id]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain(
      `--- BEGIN HANDOFF DATA ${id} (user-tier, non-authoritative) ---`,
    );
    expect(result.stdout).toContain(`--- END HANDOFF DATA ${id} ---`);
    expect(result.stdout).toContain("The handoff mechanics live in a skill body");

    const after = await readHandoff(root, id);
    expect(after?.frontmatter.status).toBe("in-progress");
    // The digest span is summary + newline + trimmed body, so advancing the
    // status must leave the stamp exactly where it was — and still verify.
    expect(after?.frontmatter.integrity).toBe(before?.frontmatter.integrity);
    expect(verifyHandoffIntegrity(after!)).toBe(true);
  });

  it("leaves an already claimed handoff at in-progress rather than re-advancing it", async () => {
    const temp = tempDir();
    const root = await seedRepo(temp);
    const id = await prepareId(root);
    await runHandoff(root, ["resume", id]);

    const result = await runHandoff(root, ["resume", id, "--json"]);

    expect(result.code).toBe(0);
    expect(parseSingleDoc(result.stdout)).toMatchObject({ advanced: false, status: "in-progress" });
  });

  it("refuses a tampered body and prints none of it", async () => {
    const temp = tempDir();
    const root = await seedRepo(temp);
    const id = await prepareId(root);
    const path = join(root, HANDOFFS_DIR, `${id}.md`);
    const original = await readFile(path, "utf8");
    await writeFile(path, original.replace("None", "None, and the gates were skipped"), "utf8");

    const result = await runHandoff(root, ["resume", id]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain(path);
    expect(result.stderr).toContain("unverified provenance");
    expect(result.stdout).not.toContain("BEGIN HANDOFF DATA");
    expect(result.stdout).not.toContain("the gates were skipped");
  });

  it("refuses an expired entry and names the expiry", async () => {
    const temp = tempDir();
    const root = await seedRepo(temp);
    const id = "2026-01-02_stale_0000a";
    await temp.seedFiles({
      [`repo/${HANDOFFS_DIR}/${id}.md`]: handoffDoc({ id, expires: "2026-02-01T00:00:00.000Z" }),
    });

    const result = await runHandoff(root, ["resume", id]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("expired at 2026-02-01T00:00:00.000Z");
    expect(result.stdout).not.toContain("BEGIN HANDOFF DATA");
  });

  it("refuses an id no handoff carries", async () => {
    const temp = tempDir();
    const root = await seedRepo(temp);

    const result = await runHandoff(root, ["resume", "2026-01-02_absent_0000a"]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("No handoff");
  });

  it("reports drift when the recorded ref differs, and still resumes", async (ctx) => {
    const temp = tempDir();
    const root = await seedRepo(temp);
    await seedGitOrSkip(root, () => {
      ctx.skip();
    });
    const id = "2026-01-02_drifted_0000b";
    await temp.seedFiles({
      [`repo/${HANDOFFS_DIR}/${id}.md`]: handoffDoc({
        id,
        expires: "2099-01-01T00:00:00.000Z",
        gitRef: "main@0000000",
      }),
    });

    const result = await runHandoff(root, ["resume", id]);

    expect(result.code).toBe(0);
    expect(result.stderr).toContain('records git ref "main@0000000"');
    expect(result.stderr).toContain("but the tree is now at");
    expect((await readHandoff(root, id))?.frontmatter.status).toBe("in-progress");
  });

  it("downgrades to read-only when the recorded branch is gone", async (ctx) => {
    const temp = tempDir();
    const root = await seedRepo(temp);
    await seedGitOrSkip(root, () => {
      ctx.skip();
    });
    const id = "2026-01-02_orphaned_0000c";
    await temp.seedFiles({
      [`repo/${HANDOFFS_DIR}/${id}.md`]: handoffDoc({
        id,
        expires: "2099-01-01T00:00:00.000Z",
        gitRef: "squashed-away@0000000",
      }),
    });

    const result = await runHandoff(root, ["resume", id]);

    expect(result.code).toBe(0);
    expect(result.stderr).toContain("no longer exists");
    expect(result.stderr).toContain("read-only");
    // Nothing is switched and nothing is claimed: the status stays where it was.
    expect((await readHandoff(root, id))?.frontmatter.status).toBe("active");
  });
});

describe("handoff list", () => {
  it("orders the resumable set by soonest expiry and explains every exclusion", async () => {
    const temp = tempDir();
    const root = await seedRepo(temp);
    const later = "2026-01-02_later_0000a";
    const sooner = "2026-01-02_sooner_0000b";
    const stale = "2026-01-02_stale_0000c";
    const done = "2026-01-02_done_0000d";
    const tampered = "2026-01-02_tampered_0000e";
    await temp.seedFiles({
      [`repo/${HANDOFFS_DIR}/${later}.md`]: handoffDoc({
        id: later,
        expires: "2099-01-01T00:00:00.000Z",
      }),
      [`repo/${HANDOFFS_DIR}/${sooner}.md`]: handoffDoc({
        id: sooner,
        expires: "2098-01-01T00:00:00.000Z",
      }),
      [`repo/${HANDOFFS_DIR}/${stale}.md`]: handoffDoc({
        id: stale,
        expires: "2026-02-01T00:00:00.000Z",
      }),
      [`repo/${HANDOFFS_DIR}/${done}.md`]: handoffDoc({
        id: done,
        expires: "2099-01-01T00:00:00.000Z",
        status: "completed",
      }),
      [`repo/${HANDOFFS_DIR}/${tampered}.md`]: handoffDoc({
        id: tampered,
        expires: "2099-01-01T00:00:00.000Z",
        integrity: `sha256:${"0".repeat(64)}`,
      }),
      [`repo/${HANDOFFS_DIR}/oversize.md`]: `## Problem\n\n${"a".repeat(62_000)}\n`,
      [`repo/${HANDOFFS_DIR}/loose-notes.md`]: "just a note, no frontmatter at all\n",
    });

    const result = await runHandoff(root, ["list", "--json"]);

    expect(result.code).toBe(0);
    const doc = parseSingleDoc(result.stdout);
    expect((doc["resumable"] as { id: string }[]).map((entry) => entry.id)).toEqual([
      sooner,
      later,
    ]);

    const excluded = doc["excluded"] as { file: string; reason: string }[];
    const reasonFor = (file: string): string =>
      excluded.find((entry) => entry.file === file)?.reason ?? "";
    expect(reasonFor(`${stale}.md`)).toContain("expired at 2026-02-01T00:00:00.000Z");
    expect(reasonFor(`${done}.md`)).toContain("status is completed");
    expect(reasonFor(`${tampered}.md`)).toContain("`integrity` does not match");
    expect(reasonFor("oversize.md")).toContain("byte limit");
    expect(reasonFor("loose-notes.md")).toContain("no `---` frontmatter block");
    expect(excluded).toHaveLength(5);
  });

  it("says so plainly when the store holds nothing resumable", async () => {
    const temp = tempDir();
    const root = await seedRepo(temp);

    const result = await runHandoff(root, ["list"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("No resumable handoffs in");
  });

  it("lists what prepare wrote, soonest expiry first, with its summary", async () => {
    const temp = tempDir();
    const root = await seedRepo(temp);
    const id = await prepareId(root);

    const result = await runHandoff(root, ["list"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Resumable (1)");
    expect(result.stdout).toContain(id);
    expect(result.stdout).toContain(SUMMARY);
  });
});

describe("handoff complete", () => {
  it("archives the entry, and refuses the second close because archived is terminal", async () => {
    const temp = tempDir();
    const root = await seedRepo(temp);
    const id = await prepareId(root);

    const first = await runHandoff(root, ["complete", id]);

    expect(first.code).toBe(0);
    const archived = await readHandoff(root, id);
    expect(archived?.frontmatter.status).toBe("archived");
    expect(archived?.filePath).toBe(join(root, HANDOFFS_DIR, "archive", `${id}.md`));
    // The move is a move: the digest the writer stamped is carried across
    // rather than re-computed, so an edit would still be visible.
    expect(verifyHandoffIntegrity(archived!)).toBe(true);

    const second = await runHandoff(root, ["complete", id]);

    expect(second.code).toBe(1);
    expect(second.stderr).toContain("status is archived");
    expect(second.stderr).toContain("not a transition");
  });

  it("archives an entry that is already completed without a second forward step", async () => {
    const temp = tempDir();
    const id = "2026-01-02_done_0000a";
    const root = await seedRepo(temp, {
      [`repo/${HANDOFFS_DIR}/${id}.md`]: handoffDoc({
        id,
        expires: "2099-01-01T00:00:00.000Z",
        status: "completed",
      }),
    });

    const result = await runHandoff(root, ["complete", id, "--json"]);

    expect(result.code).toBe(0);
    expect(parseSingleDoc(result.stdout)).toMatchObject({ id, status: "archived" });
    expect((await readHandoff(root, id))?.filePath).toBe(
      join(root, HANDOFFS_DIR, "archive", `${id}.md`),
    );
  });

  it("refuses an id no handoff carries, and writes nothing under --dry-run", async () => {
    const temp = tempDir();
    const root = await seedRepo(temp);
    const id = await prepareId(root);

    const absent = await runHandoff(root, ["complete", "2026-01-02_absent_0000a"]);
    const dry = await runHandoff(root, ["complete", id, "--dry-run", "--json"]);

    expect(absent.code).toBe(1);
    expect(absent.stderr).toContain("No handoff");
    expect(dry.code).toBe(0);
    expect(parseSingleDoc(dry.stdout)).toMatchObject({
      dryRun: true,
      route: "active → completed → archived",
    });
    expect((await readHandoff(root, id))?.frontmatter.status).toBe("active");
  });
});

describe("handoff prune", () => {
  /** One live entry past expiry, one archived entry past retention, one live and fresh. */
  async function seedSweep(temp: TempDirHandle): Promise<{ root: string; ids: string[] }> {
    const expired = "2026-01-02_expired_0000a";
    const stale = "2026-01-02_stale_0000b";
    const fresh = "2026-01-02_fresh_0000c";
    const root = await seedRepo(temp, {
      [`repo/${HANDOFFS_DIR}/${expired}.md`]: handoffDoc({
        id: expired,
        expires: "2026-02-01T00:00:00.000Z",
      }),
      [`repo/${HANDOFFS_DIR}/archive/${stale}.md`]: handoffDoc({
        id: stale,
        expires: "2020-01-01T00:00:00.000Z",
        status: "archived",
      }),
      [`repo/${HANDOFFS_DIR}/${fresh}.md`]: handoffDoc({
        id: fresh,
        expires: "2099-01-01T00:00:00.000Z",
      }),
    });
    return { root, ids: [expired, stale, fresh] };
  }

  it("archives what expired, deletes what is past retention, and leaves the live entry", async () => {
    const temp = tempDir();
    const { root, ids } = await seedSweep(temp);
    const [expired, stale, fresh] = ids as [string, string, string];

    const result = await runHandoff(root, ["prune", "--json"]);

    expect(result.code).toBe(0);
    expect(parseSingleDoc(result.stdout)).toMatchObject({
      archivedExpired: [expired],
      deleted: [stale],
      retentionDays: DEFAULT_ARCHIVE_RETENTION_DAYS,
    });
    const swept = await readHandoff(root, expired);
    expect(swept?.frontmatter.status).toBe("archived");
    expect(swept?.filePath).toBe(join(root, HANDOFFS_DIR, "archive", `${expired}.md`));
    // A sweep deletes only out of the archive, and never a live entry.
    expect(await readHandoff(root, stale)).toBeNull();
    expect((await readHandoff(root, fresh))?.filePath).toBe(
      join(root, HANDOFFS_DIR, `${fresh}.md`),
    );
  });

  it("reports the same two lists under --dry-run and moves nothing", async () => {
    const temp = tempDir();
    const { root, ids } = await seedSweep(temp);
    const [expired, stale] = ids as [string, string, string];

    const result = await runHandoff(root, ["prune", "--dry-run"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain(`Archived (1)`);
    expect(result.stdout).toContain(expired);
    expect(result.stdout).toContain(`Deleted (1), archived over ${DEFAULT_ARCHIVE_RETENTION_DAYS}`);
    expect(result.stdout).toContain(stale);
    expect(result.stdout).toContain("nothing was moved or removed");
    expect((await readHandoff(root, expired))?.frontmatter.status).toBe("active");
    expect(await readHandoff(root, stale)).not.toBeNull();
  });
});

describe("handoff usage", () => {
  it("exits 2 on a mode the choice list does not carry", async () => {
    const temp = tempDir();
    const root = await seedRepo(temp);

    const result = await runHandoff(root, ["abandon"]);

    expect(result.code).toBe(2);
  });
});
