import { readFile, readdir, stat } from "node:fs/promises";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { useCliFixture } from "../support/cliHarness.ts";

/**
 * The journey e2e: one serialized full lifecycle — init through clean —
 * against the REAL entry with pseudo-home isolation. Every step runs in the
 * same fixture because each one depends on the state the previous step wrote;
 * vitest's file-sequential default keeps the order.
 */

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const CORPUS_DIR = join(REPO_ROOT, "content");

/**
 * The child process resolves the bundled corpus from its own package root, and
 * `resolveBundledContentRoot` throws CONFIG_ERROR when NEITHER `content/` nor
 * `dist/content` exists (init tolerates that; sync/check do not).
 *
 * Justification for replacing the previous create-empty-if-absent fixture: it
 * was written while `content/` was still unborn, to give the journey the
 * "empty corpus" semantics it was briefed with. The corpus is now committed,
 * so absence means a broken checkout, not a phase — and this journey is worth
 * more running against the real 36-artifact corpus than against a staged empty
 * directory. Requiring presence is the stricter of the two; a missing corpus
 * now fails here, naming the path, instead of silently retargeting the run.
 */
beforeAll(async () => {
  const corpus = await stat(CORPUS_DIR).catch(() => null);
  expect(corpus?.isDirectory(), `the bundled corpus is missing at ${CORPUS_DIR}`).toBe(true);
});

/** Repo-relative POSIX paths of every file under `dir`, `.git/` excluded, sorted. */
async function snapshotTree(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name).slice(dir.length + 1).split(sep).join("/"))
    .filter((path) => path !== ".git" && !path.startsWith(".git/"))
    .toSorted();
}

/**
 * The manifest as the journey observes it — structural, not imported from
 * `src/`: this lane crosses the process boundary and reads what a user would.
 */
interface ObservedManifest {
  updatedAt: string;
  selection: { items: Record<string, string[]> };
}

async function readManifest(path: string): Promise<ObservedManifest> {
  return JSON.parse(await readFile(path, "utf8")) as ObservedManifest;
}

describe("the full lifecycle journey", () => {
  const getFixture = useCliFixture({ git: true });

  it("init -y through clean -y returns the tree to pre-init plus .gitignore", {
    timeout: 180_000,
  }, async () => {
    const fixture = getFixture();
    const treeBefore = await snapshotTree(fixture.repoDir);
    expect(treeBefore).toEqual(["history.md"]); // the git seeder's one file

    // ── init -y: exit 0 and the ready panel ──────────────────────────────
    const init = await fixture.run(["init", "-y"]);
    expect(init.code).toBe(0);
    expect(init.stdout).toContain("stamity is ready.");
    expect(init.stdout).toContain("-> installed claude");
    expect(init.stdout).toContain("next steps:");
    // Piped-run stdout completeness: the panel's LAST line arrived intact,
    // which is the observable proof of the no-process.exit() discipline.
    expect(init.stdout.trimEnd().endsWith("stamity-onboard/SKILL.md")).toBe(true);

    // ── the real corpus reached the manifest: every class carries picks ───
    const manifestPath = join(fixture.repoDir, ".stamity", "manifest.json");
    const afterInit = await readManifest(manifestPath);
    for (const [contentClass, ids] of Object.entries(afterInit.selection.items)) {
      expect(ids.length, `selection.items.${contentClass} is empty`).toBeGreaterThan(0);
    }

    // ── sync straight after init: idempotent, writes nothing ─────────────
    // Justification for the changed expectation: the trailing counts asserted
    // `0 unchanged`, which only held while the emission planner was the no-op
    // and init wrote no files at all. Init now emits the real corpus, so the
    // load-bearing claim is stronger and is what is asserted — a sync
    // immediately after init creates and updates NOTHING, and every file it
    // planned is already current. That is the only-when-stale contract
    // observed end to end through the real CLI. The count itself is
    // read off the report rather than pinned, so the corpus can grow without
    // editing this e2e.
    const sync = await fixture.run(["sync"]);
    expect(sync.code).toBe(0);
    expect(sync.stdout).toMatch(/synced: 0 created, 0 updated, [1-9]\d* unchanged, 0 skipped/);
    expect(sync.stdout).toContain("provenance (the manifest is the record)");
    const afterSync = await readManifest(manifestPath);
    expect(Date.parse(afterSync.updatedAt)).toBeGreaterThan(Date.parse(afterInit.updatedAt));
    expect(afterSync.selection).toEqual(afterInit.selection);

    // ── check: environment healthy, drift clean ──────────────────────────
    const check = await fixture.run(["check"]);
    expect(check.code).toBe(0);
    expect(check.stdout).toContain("drift: clean");

    // ── config set: a manifest edit that DOES change emitted content ─────
    // Justification for the changed expectation: this step asserted that the
    // edit introduces no drift, which held only while nothing was emitted.
    // `maturityTier` is substituted into the charter (`${STAMITY:MATURITY_TIER}`
    // — `src/emit/substitution.ts`), so changing it genuinely changes the bytes
    // AGENTS.md should carry, and check reporting drift is the correct answer,
    // not a regression. The lifecycle claim is asserted in full instead: the
    // edit drifts, a sync reconciles it, and check goes clean again.
    const set = await fixture.run(["config", "set", "maturityTier", "team"]);
    expect(set.code).toBe(0);
    expect(set.stdout).toContain("set maturityTier: solo -> team");

    const checkAfterSet = await fixture.run(["check"]);
    expect(checkAfterSet.code).toBe(1);
    expect(checkAfterSet.stdout).toContain("npx @zomarit/stamity sync");

    const resync = await fixture.run(["sync"]);
    expect(resync.code).toBe(0);
    expect(resync.stdout).toMatch(/synced: 0 created, [1-9]\d* updated/);

    const checkAfterResync = await fixture.run(["check"]);
    expect(checkAfterResync.code).toBe(0);
    expect(checkAfterResync.stdout).toContain("drift: clean");

    // ── validate: nothing user-authored yet ──────────────────────────────
    const validate = await fixture.run(["validate"]);
    expect(validate.code).toBe(0);

    // ── learn capture round-trip: body in on stdin, stamped file on disk ─
    const capture = await fixture.run(
      ["learn", "capture", "--title", "cache misses", "--summary", "one line"],
      { stdin: "## Why\n\nbecause fixtures.\n\n## How to apply\n\nrun it\n" },
    );
    expect(capture.code).toBe(0);
    expect(capture.stdout).toContain('Captured "cache-misses.md"');

    const stored = await readFile(
      join(fixture.repoDir, ".stamity", "learnings", "cache-misses.md"),
      "utf8",
    );
    expect(stored).toContain("id: cache-misses");
    expect(stored).toContain("title: cache misses");
    expect(stored).toContain("integrity: sha256:");
    expect(stored).toContain("## Why\n\nbecause fixtures.");
    expect(stored).toContain("## How to apply\n\nrun it");

    // ── clean -y: everything generated goes, the user's tree stays ───────
    // This assertion was briefly a known-failing one: the reclaim ladder could
    // prove engine authorship only by a `stamity-` BASENAME, by a recorded
    // contentHash for a path inside `.stamity/`, or by the trusted allowlist —
    // and the last of those earned no deletion on its own. The adapter phase
    // emits at platform-mandated, marker-less paths outside `.stamity/`, which
    // satisfied none of them, so 13 files survived an uninstall that reported
    // success. Fixed at the two real causes rather than by relaxing this line:
    // the ladder now reads the ownership marker off any ancestor directory and
    // admits a MATCHING recorded hash as the allowlist's proof of sole
    // ownership (`src/merge/reclaim.ts`), and init records `contentHash` on
    // every ledger row as sync already did (`init/apply.ts`), so a repo that
    // was only ever inited can be cleaned. A user-edited file still survives —
    // the hash no longer matches, which is asserted in test/merge/reclaim.test.ts.
    const clean = await fixture.run(["clean", "-y"]);
    expect(clean.code).toBe(0);
    expect(clean.stdout).toContain(".stamity/ removed");

    const treeAfter = await snapshotTree(fixture.repoDir);
    expect(treeAfter).toEqual([".gitignore", "history.md"]);
    // The one surviving addition is the engine's single gitignore entry.
    const gitignore = await readFile(join(fixture.repoDir, ".gitignore"), "utf8");
    expect(gitignore).toContain(".env.mcp");
  });
});
