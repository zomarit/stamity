import { createHash } from "node:crypto";
import { appendFile, cp, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it, type TestContext } from "vitest";
import { makeCliFixture, type CliFixture } from "../support/cliHarness.ts";
import { ensureDistBuilt } from "../support/distBuild.ts";
import { seedGitRepo } from "../support/repoFixtures.ts";

/**
 * The upgrade proof (REQ-PLUGIN-046, plan 020-cli-native-01 unit d9): a tree the released 1.14.0
 * wrote goes through this checkout's BUILT `sync` and `check` (`node dist/cli.js`, cliHarness
 * `entry: "dist"`), the way an operator's repository meets 1.15.0 the first time.
 *
 * The fixture, `test/fixtures/release-1-14-0-tree/`, is the released package's own output, never
 * hand-written: on 2026-10-14, in a scratch git repository seeded with this file's two user files
 * (`package.json` as `tsRepoFiles()` writes it, `tsconfig.json`) and one committed source file,
 * `npx -y @zomarit/stamity@1.14.0 init --tools claude,cursor,copilot,codex -y` ran under an empty
 * HOME. Everything it left beside `.git/` is kept, all four clients: the largest file is the
 * manifest at 79 KB, well inside the repository's 1 MB per-file hygiene budget, so the two-client
 * trim the plan allows for an oversized fixture was not needed. The source file is left out: `sync`
 * over the tree without it wrote the same bytes and the same manifest (bar `updatedAt`), and kept,
 * it would sit inside this repository's own typecheck and dead-code scopes as an orphan. The
 * fixture is LF on every checkout (`.gitattributes`), which the recorded content hashes need.
 *
 * Two encodings, both undone on copy, neither touching a byte inside a file. Each stores names with
 * the suffix `.fixture`:
 *   - the tree's twenty `.mjs` files, as `<name>.mjs.fixture`. Under `test/` a `.mjs` file is a test
 *     source to the test-input census (`test/ci/testInputsGuard.test.ts`), and the 1.14.0
 *     session-start hook holds a regex literal past that guard's 200-character bound, which fails
 *     it; the linters would also read shipped hook bytes as this repository's source.
 *   - every file and folder a client loads as instructions ({@link ENCODED_ROOTS}: the three charter
 *     files and the five client folders). Under their own names they would be a second, live
 *     charter inside this repository: a client that discovers nested instruction files — a
 *     subfolder's `CLAUDE.md` or `AGENTS.md`, nested rules or skills — would load the 1.14.0
 *     setup's gates beside this repository's own while an agent works on this file.
 * {@link upgradeFixture} renames both back in the scratch copy, checks both counts and refuses any
 * `.fixture` name left over, so `sync` meets the tree exactly as 1.14.0 wrote it.
 *
 * What the cases hold, and nothing about the manifest's own shape beyond its ledger's `path`s and
 * the `plugin` block a 1.14.0 setup could record: the manifest generation moves in this package (a
 * migration on read), and the claims here are the upgrade's, not a schema's.
 *   - `sync` exits 0; every path the 1.14.0 ledger recorded is still on disk and still owned after it
 *     (rewritten or confirmed under the owner rules), unless {@link EXPECTED_RECLAIMS} names it with
 *     its reason; every other file the tree held — the user's — keeps its bytes; any file `sync`
 *     adds is one the new ledger owns.
 *   - the user content an operator adds to the co-owned files after a 1.14.0 init
 *     ({@link JSON_USER_CONTENT}, {@link TEXT_USER_CONTENT}) survives both syncs byte for byte.
 *   - a second `sync` moves no byte: the one permitted difference is the manifest's `updatedAt`, the
 *     write clock `sync` stamps on every run (the same allowance the dist dogfood journey makes).
 *   - `check` exits 0 on the upgraded tree, its `manifest` row `pass`, and no `plugin-duplicates` row.
 *   - with the 1.14.0 `plugin` block added to the manifest (the block a 1.15.0 sync carried on as
 *     it stood), the first `sync` writes the manifest without it and says so once, a second `sync`
 *     moves no byte and says nothing of it, and `check` exits 0 with no `plugin-duplicates` row
 *     (TEST CHANGE, justified: v16-manifest-plugin-block, REQ-PLUGIN-014, REQ-PLUGIN-016 — the
 *     block was held through the 1.15 line and the row warned; both leave after it).
 *
 * Git-less machines skip per the harness convention. The fixture is committed before the first
 * `sync`, as an operator's tree would be, so an overwrite is recoverable from history and no `.bak`
 * is taken.
 */

/** Per-case budget: two or three cold dist runs over a ~200-file four-client tree, plus the copy. */
const CASE_TIMEOUT_MS = 240_000;

const FIXTURE_DIR = fileURLToPath(new URL("../fixtures/release-1-14-0-tree", import.meta.url));

/** The suffix every encoded fixture name is stored under (see the header). */
const STORED_SUFFIX = ".fixture";

/** How many `.mjs` files the released 1.14.0 four-client tree holds. */
const STORED_SCRIPT_COUNT = 20;

/** The instruction files and client folders stored encoded at the fixture's root (see the header). */
const ENCODED_ROOTS: readonly string[] = [
  ".agents",
  ".claude",
  ".codex",
  ".cursor",
  ".github",
  "AGENTS.md",
  "AGENTS.override.md",
  "CLAUDE.md",
];

/**
 * The 1.14.0-owned paths this engine is expected to delete on the upgrade, each with why. Empty:
 * this engine retires no artifact a CLI-mode 1.14.0 setup emitted, so every path that tree owned
 * must still be on disk and owned after `sync`. An engine that drops an artifact on purpose names
 * its path here, with the reason, in the change that drops it; any other missing path (a client's
 * tree, the charter, a guard hook) fails the case.
 */
const EXPECTED_RECLAIMS: ReadonlyMap<string, string> = new Map<string, string>();

/**
 * One user element inside a co-owned JSON file, as an operator adds it after a 1.14.0 init:
 * `element` is pushed onto the array at `at`, `member` sets the key `at` ends with. The
 * engine writes these files with two-space JSON, so {@link jsonSpan} gives the element's exact text.
 */
interface JsonUserContent {
  path: string;
  at: readonly string[];
  shape: "element" | "member";
  value: unknown;
  /** What of the element a sync keeps byte for byte, where the engine adds its own beside it. */
  synced?: Omit<JsonUserContent, "synced">;
}

/** One user hook entry or key per co-owned JSON file the 1.14.0 ledger records. */
const JSON_USER_CONTENT: readonly JsonUserContent[] = [
  {
    path: ".claude/settings.json",
    at: ["hooks", "PreToolUse"],
    shape: "element",
    value: { matcher: "Bash", hooks: [{ type: "command", command: "echo team-hook" }] },
  },
  {
    path: ".claude/settings.json",
    at: ["permissions"],
    shape: "member",
    value: { allow: ["Bash(npm test)"] },
    // TEST CHANGE, justified (plan u20 and record 23:32Z build/44: 1.15.0's sync renders the
    // engine's `permissions.deny` rows into `.claude/settings.json`, an owner's rows staying the
    // owner's): the user's `permissions` object gains the engine's `deny` beside its `allow`, so
    // from the first sync on the span held exactly once is the user's `allow` member, unchanged.
    synced: { path: ".claude/settings.json", at: ["permissions", "allow"], shape: "member", value: ["Bash(npm test)"] },
  },
  {
    path: ".codex/hooks.json",
    at: ["hooks", "PreToolUse"],
    shape: "element",
    value: { matcher: "Bash", hooks: [{ type: "command", command: "echo team-hook" }] },
  },
  {
    path: ".cursor/hooks.json",
    at: ["hooks", "preToolUse"],
    shape: "element",
    value: { command: "echo team-hook" },
  },
];

/**
 * User text appended to the files the engine shares with the operator by text: a table of the
 * operator's own in the co-owned `.codex/config.toml`, a line after the managed block of
 * the Claude bridge, and an ignore line beside the ones init added.
 */
const TEXT_USER_CONTENT: readonly { path: string; text: string }[] = [
  { path: ".codex/config.toml", text: '\n[profiles.team]\nmodel = "team-model"\n' },
  { path: "CLAUDE.md", text: "\nTeam notes sit below the managed block.\n" },
  { path: ".gitignore", text: "team-cache/\n" },
];

/** The pre-flight canary's ignore line 1.15.0's sync appends; structural, as the manifest path below. */
const CANARY_IGNORE_LINE = ".stamity/preflight-canary.json";

/** The run-ended marker's ignore line, appended after the canary's; structural, as the canary's. */
const MARKER_IGNORE_LINE = ".stamity/run-ended.json";

/** Cursor's context-once folder's ignore line, appended after the marker's; structural, as the canary's. */
const CONTEXT_ONCE_IGNORE_LINE = ".stamity/context-once/";

/** The client model list cache's ignore line, appended after the context-once folder's; structural, as the canary's. */
const MODEL_CACHE_IGNORE_LINE = ".stamity/client-models.json";

/** Claude Code's hook folder; structural, never imported from src/ (cliHarness lane discipline). */
const CLAUDE_HOOKS_FOLDER = ".claude/hooks/stamity";

/** The copies Claude Code's hooks run, and the policy copy, that the upgrade adds; structural, as the folder. */
const CLAUDE_HOOK_COPIES: readonly string[] = [
  "stamity-session-start.mjs",
  "stamity-pre-tool-use-guard.mjs",
  "stamity-config-tamper-notice.mjs",
  "stamity-person-only-guard.mjs",
  "stamity-review-gate.mjs",
  "stamity-unattended-ask-gate.mjs",
  "stamity-cloud-readiness.mjs",
  "stamity-agent-tool-policies.json",
].map((file) => `${CLAUDE_HOOKS_FOLDER}/${file}`);

/** Repo-relative manifest path; structural, never imported from src/ (cliHarness lane discipline). */
const MANIFEST_REL = ".stamity/manifest.json";

/** The manifest as observed on disk: only what the claims above read. */
interface ObservedManifest {
  updatedAt?: unknown;
  ledger: { path: string }[];
  plugin?: unknown;
  [key: string]: unknown;
}

/** One `check --json` doctor row. */
interface DoctorRow {
  id: string;
  status: string;
  detail: string;
}

/**
 * The block a 1.14.0 manifest carried when it recorded plugin installs, in that release's
 * `PluginConfig` shape (`mode`, `clients.<tool>.{version, classes}`). `mode: "generated"` is
 * legal 1.14.0 with `clients` present (the record names the roots without moving ownership), which
 * keeps the fixture's generated tree exactly what that manifest describes. Two clients, so the
 * block is more than the one-client record the unit cases drop.
 */
const HELD_PLUGIN_BLOCK = {
  mode: "generated",
  clients: {
    claude: { version: "1.14.0", classes: ["skill", "command"] },
    cursor: { version: "1.14.0", classes: ["rule"] },
  },
};

/** sha256 per file under `dir`, keyed by repo-relative POSIX path, `.git/` excluded. */
async function treeHashMap(dir: string): Promise<Map<string, string>> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) => ({
      abs: join(entry.parentPath, entry.name),
      rel: join(entry.parentPath, entry.name).slice(dir.length + 1).split(sep).join("/"),
    }))
    .filter(({ rel }) => rel !== ".git" && !rel.startsWith(".git/"));
  const map = new Map<string, string>();
  await Promise.all(
    files.map(async ({ abs, rel }) => {
      map.set(rel, createHash("sha256").update(await readFile(abs)).digest("hex"));
    }),
  );
  return map;
}

async function readManifest(repoDir: string): Promise<ObservedManifest> {
  return JSON.parse(await readFile(join(repoDir, ...MANIFEST_REL.split("/")), "utf8")) as ObservedManifest;
}

function ledgerPaths(manifest: ObservedManifest): Set<string> {
  return new Set(manifest.ledger.map((row) => row.path));
}

/** The manifest minus its write clock, for the second-sync comparison. */
function withoutClock(manifest: ObservedManifest): Record<string, unknown> {
  const { updatedAt: _clock, ...rest } = manifest;
  return rest;
}

/**
 * Undoes both encodings in the scratch copy at `dir`: every `<name>.mjs.fixture` back to
 * `<name>.mjs`, then each of {@link ENCODED_ROOTS} back to its own name. Throws when a count is off
 * or any `.fixture` name is left, so a fixture edited out of step with this list cannot pass.
 */
async function restoreEncodedNames(dir: string): Promise<void> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  const scripts = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(`.mjs${STORED_SUFFIX}`))
    .map((entry) => join(entry.parentPath, entry.name));
  if (scripts.length !== STORED_SCRIPT_COUNT) {
    throw new Error(`expected ${STORED_SCRIPT_COUNT} stored .mjs files in the fixture, found ${scripts.length}`);
  }
  await Promise.all(scripts.map((path) => rename(path, path.slice(0, -STORED_SUFFIX.length))));
  // Renamed after the scripts, whose paths run through these folders.
  await Promise.all(
    ENCODED_ROOTS.map((name) => rename(join(dir, `${name}${STORED_SUFFIX}`), join(dir, name))),
  );
  const leftover = (await readdir(dir, { recursive: true })).filter((path) =>
    path.endsWith(STORED_SUFFIX),
  );
  if (leftover.length > 0) throw new Error(`encoded names left in the copy: ${leftover.join(", ")}`);
}

/** Splits a repo-relative POSIX path into segments for `join`. */
function inRepo(repoDir: string, path: string): string {
  return join(repoDir, ...path.split("/"));
}

/** Re-indents every line after the first by `width` spaces. */
function indented(text: string, width: number): string {
  return text.split("\n").join(`\n${" ".repeat(width)}`);
}

/**
 * The exact text a user JSON element occupies in a two-space JSON file: an array element under
 * `at` sits one level below it, and a member is its key and value at the depth of `at`'s end.
 */
function jsonSpan(content: JsonUserContent): string {
  const body = JSON.stringify(content.value, null, 2);
  if (content.shape === "element") return indented(body, 2 * (content.at.length + 1));
  const key = content.at.at(-1) ?? "";
  return `${JSON.stringify(key)}: ${indented(body, 2 * content.at.length)}`;
}

/** How many times `span` occurs in `text`. */
function occurrences(text: string, span: string): number {
  return text.split(span).length - 1;
}

/** Adds every user element and line to the restored 1.14.0 tree, as an operator would. */
async function seedUserContent(repoDir: string): Promise<void> {
  // Sequential: two entries edit one file.
  for (const content of JSON_USER_CONTENT) {
    const file = inRepo(repoDir, content.path);
    // oxlint-disable-next-line no-await-in-loop -- each edit reads the previous one's write
    const doc = JSON.parse(await readFile(file, "utf8")) as Record<string, unknown>;
    let parent: Record<string, unknown> = doc;
    for (const key of content.at.slice(0, -1)) parent = parent[key] as Record<string, unknown>;
    const last = content.at.at(-1) ?? "";
    if (content.shape === "element") (parent[last] as unknown[]).push(content.value);
    else parent[last] = content.value;
    // oxlint-disable-next-line no-await-in-loop -- each edit reads the previous one's write
    await writeFile(file, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
  }
  for (const { path, text } of TEXT_USER_CONTENT) {
    // oxlint-disable-next-line no-await-in-loop -- one file at a time keeps the seeding readable
    await appendFile(inRepo(repoDir, path), text, "utf8");
  }
}

/** Every seeded user span, present exactly once, byte for byte; `when` names the moment. */
async function expectUserContent(repoDir: string, when: string, synced = true): Promise<void> {
  for (const seeded of JSON_USER_CONTENT) {
    const content = synced ? (seeded.synced ?? seeded) : seeded;
    // oxlint-disable-next-line no-await-in-loop -- a handful of small reads, asserted in order
    const text = await readFile(inRepo(repoDir, content.path), "utf8");
    expect(
      occurrences(text, jsonSpan(content)),
      `${when}: the user's ${content.at.join(".")} entry in ${content.path}`,
    ).toBe(1);
  }
  for (const { path, text: span } of TEXT_USER_CONTENT) {
    // oxlint-disable-next-line no-await-in-loop -- a handful of small reads, asserted in order
    const text = await readFile(inRepo(repoDir, path), "utf8");
    expect(occurrences(text, span), `${when}: the user's text in ${path}`).toBe(1);
  }
}

/**
 * A fresh pseudo-home fixture holding a copy of the 1.14.0 tree, its names restored, committed.
 * `edit` runs on the copy before the commit. A missing git binary skips the case; any other failure
 * cleans up and throws.
 */
async function upgradeFixture(
  ctx: TestContext,
  edit?: (repoDir: string) => Promise<void>,
): Promise<CliFixture> {
  const fixture = await makeCliFixture({ entry: "dist" });
  try {
    await cp(FIXTURE_DIR, fixture.repoDir, { recursive: true });
    await restoreEncodedNames(fixture.repoDir);
    if (edit !== undefined) await edit(fixture.repoDir);
    await seedGitRepo(fixture.repoDir);
  } catch (error) {
    await fixture.cleanup();
    if (error instanceof Error && error.name === "GitUnavailableError") ctx.skip();
    throw error;
  }
  return fixture;
}

/** The one line `sync` prints when it writes the manifest without the 1.14.0 `plugin` block. */
const DROP_LINE = "  manifest: dropped the `plugin` key a 1.14 setup recorded; nothing has read it since 1.15.0";

/** `check --json`'s doctor row ids, in order. */
function doctorIds(stdout: string): string[] {
  return (JSON.parse(stdout) as { doctor: DoctorRow[] }).doctor.map((row) => row.id);
}

/** `check --json`'s doctor row by id; fails the case when the row is missing. */
function doctorRow(stdout: string, id: string): DoctorRow {
  const report = JSON.parse(stdout) as { doctor: DoctorRow[] };
  const row = report.doctor.find((candidate) => candidate.id === id);
  if (row === undefined) throw new Error(`check --json carries no ${id} row:\n${stdout}`);
  return row;
}

describe("a 1.14.0 tree upgrades through the current sync and check (node dist/cli.js)", () => {
  beforeAll(async () => {
    await ensureDistBuilt();
  }, CASE_TIMEOUT_MS);

  it("syncs under the owner rules, keeps the user's content, a second sync moves no byte, and check exits 0", {
    timeout: CASE_TIMEOUT_MS,
  }, async (ctx) => {
    const fixture = await upgradeFixture(ctx, seedUserContent);
    try {
      // The spans are what the seeding wrote, so a later miss is the sync's and not the formula's.
      await expectUserContent(fixture.repoDir, "before sync", false);
      const before = await treeHashMap(fixture.repoDir);
      const gitignoreBefore = await readFile(inRepo(fixture.repoDir, ".gitignore"), "utf8");
      const ownedBefore = ledgerPaths(await readManifest(fixture.repoDir));
      // The fixture is the four-client tree, not an empty one: the walk below has work to do.
      expect(ownedBefore.size).toBeGreaterThan(100);

      const first = await fixture.run(["sync"]);
      expect(first.code, `first sync failed:\n${first.stdout}\n${first.stderr}`).toBe(0);

      const afterFirst = await treeHashMap(fixture.repoDir);
      const upgraded = await readManifest(fixture.repoDir);
      const ownedAfter = ledgerPaths(upgraded);

      const rewritten: string[] = [];
      const reclaimed: string[] = [];
      const userFiles: string[] = [];
      for (const [path, hash] of before) {
        if (path === MANIFEST_REL) continue;
        if (ownedBefore.has(path)) {
          if (!afterFirst.has(path)) reclaimed.push(path);
          else {
            // Still on disk, so still the engine's: a path sync keeps but no longer owns would be
            // an orphan nothing reclaims.
            expect(ownedAfter.has(path), `${path} stayed on disk but left the ledger`).toBe(true);
            if (afterFirst.get(path) !== hash) rewritten.push(path);
          }
        } else {
          userFiles.push(path);
          // TEST CHANGE, justified (record 23:32Z and 23:37Z, u14's build/45 and build/48: the
          // pre-flight canary joins the required ignore entries, and the upgrade appends its line
          // even where `.stamity/review-gate.json*` is already ignored): the user's `.gitignore`
          // gains that one line at its end, every other byte held; every other user file is held
          // whole, and the second sync below moves neither.
          // TEST CHANGE, justified (pr/17): the engine now ignores the run-ended marker too, so the upgrade appends
          // its line after the canary's; the user's bytes before them are still held.
          // TEST CHANGE, justified (v6-cursor-cloud, REQ-FLOW-115): the engine now ignores Cursor's context-once
          // markers, so the upgrade appends that folder's line after the marker's.
          // TEST CHANGE, justified (v17-model-list-cache, REQ-LADDER-009): the engine now ignores the
          // client model list cache, so the upgrade appends its line last.
          const expected =
            path === ".gitignore"
              ? createHash("sha256")
                  .update(`${gitignoreBefore}${CANARY_IGNORE_LINE}\n${MARKER_IGNORE_LINE}\n${CONTEXT_ONCE_IGNORE_LINE}\n${MODEL_CACHE_IGNORE_LINE}\n`, "utf8")
                  .digest("hex")
              : hash;
          expect(afterFirst.get(path), `the user's ${path} was moved by sync`).toBe(expected);
        }
      }
      // Activated, not a no-op: 1.14.0's content is behind this checkout's, so the upgrade rewrites
      // engine files, and the tree holds user files whose bytes the walk above held still.
      expect(rewritten.length).toBeGreaterThan(0);
      expect(userFiles.length).toBeGreaterThan(0);
      // A missing owned path passes only when it is named, with its reason, as an expected reclaim.
      expect(reclaimed.toSorted(), "1.14.0-owned paths sync deleted").toEqual(
        [...EXPECTED_RECLAIMS.keys()].toSorted(),
      );
      for (const path of reclaimed) {
        expect(ownedAfter.has(path), `${path} was reclaimed yet is still in the ledger`).toBe(false);
      }
      for (const path of afterFirst.keys()) {
        if (before.has(path) || path === MANIFEST_REL) continue;
        expect(ownedAfter.has(path), `sync created ${path}, which no ledger row owns`).toBe(true);
      }
      // w6-claude-hooks-in-claude-dir (REQ-FLOW-113, REQ-FLOW-104): the upgrade adds the copies Claude Code's hooks
      // run under `.claude/hooks/stamity/`, the policy copy beside them, and re-renders every engine entry in the
      // settings document to run a copy; the 1.14.0 generated scripts stay (EXPECTED_RECLAIMS is empty).
      for (const path of CLAUDE_HOOK_COPIES) {
        expect(before.has(path), `${path} was already in the 1.14.0 tree`).toBe(false);
        expect(afterFirst.has(path), `the upgrade did not write ${path}`).toBe(true);
        expect(ownedAfter.has(path), `${path} is not owned after the upgrade`).toBe(true);
      }
      const settings = JSON.parse(await readFile(inRepo(fixture.repoDir, ".claude/settings.json"), "utf8")) as {
        hooks: Record<string, { hooks: { command: string }[] }[]>;
      };
      const engineCommands = Object.values(settings.hooks)
        .flatMap((entries) => entries.flatMap((entry) => entry.hooks.map((hook) => hook.command)))
        .filter((command) => command.includes("stamity-"));
      expect(engineCommands.length).toBeGreaterThan(8);
      for (const command of engineCommands) {
        expect(command, command).toContain(`/${CLAUDE_HOOKS_FOLDER}/stamity-`);
        expect(command, command).not.toContain(".stamity/generated/hooks/");
      }
      await expectUserContent(fixture.repoDir, "after the first sync");

      const second = await fixture.run(["sync"]);
      expect(second.code, `second sync failed:\n${second.stdout}\n${second.stderr}`).toBe(0);
      await expectUserContent(fixture.repoDir, "after the second sync");
      const afterSecond = await treeHashMap(fixture.repoDir);
      expect([...afterSecond.keys()].toSorted()).toEqual([...afterFirst.keys()].toSorted());
      for (const [path, hash] of afterFirst) {
        if (path === MANIFEST_REL) continue;
        expect(afterSecond.get(path), `the second sync moved ${path}`).toBe(hash);
      }
      expect(withoutClock(await readManifest(fixture.repoDir))).toEqual(withoutClock(upgraded));

      const check = await fixture.run(["check", "--json"]);
      expect(check.code, `check failed:\n${check.stdout}\n${check.stderr}`).toBe(0);
      // TEST CHANGE, justified (v16-manifest-plugin-block, REQ-PLUGIN-016): the leftover-plugin
      // row left, so the contrast for the variant below is the manifest row and the row's absence.
      expect(doctorRow(check.stdout, "manifest").status).toBe("pass");
      expect(doctorIds(check.stdout)).not.toContain("plugin-duplicates");
    } finally {
      await fixture.cleanup();
    }
  });

  // TEST CHANGE, justified (v16-manifest-plugin-block, REQ-PLUGIN-014, REQ-PLUGIN-016): the case
  // pinned the block kept value-identical through sync and the leftover row's warn; the hold ended,
  // so it pins the block dropped by the first sync, said once, and a second sync moving no byte.
  it("drops a 1.14.0 plugin block on the first sync, says so once, moves no byte on the second, and check exits 0", {
    timeout: CASE_TIMEOUT_MS,
  }, async (ctx) => {
    const fixture = await upgradeFixture(ctx, async (repoDir) => {
      const manifestPath = join(repoDir, ...MANIFEST_REL.split("/"));
      const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as ObservedManifest;
      manifest.plugin = HELD_PLUGIN_BLOCK;
      await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    });
    try {
      const sync = await fixture.run(["sync"]);
      expect(sync.code, `sync failed:\n${sync.stdout}\n${sync.stderr}`).toBe(0);
      expect(sync.stdout.split("\n").filter((line) => line.includes("`plugin` key"))).toEqual([DROP_LINE]);
      const upgraded = await readManifest(fixture.repoDir);
      expect(Object.keys(upgraded)).not.toContain("plugin");
      const afterFirst = await treeHashMap(fixture.repoDir);

      const second = await fixture.run(["sync"]);
      expect(second.code, `second sync failed:\n${second.stdout}\n${second.stderr}`).toBe(0);
      expect(second.stdout).not.toContain("`plugin` key");
      const afterSecond = await treeHashMap(fixture.repoDir);
      expect([...afterSecond.keys()].toSorted()).toEqual([...afterFirst.keys()].toSorted());
      for (const [path, hash] of afterFirst) {
        if (path === MANIFEST_REL) continue;
        expect(afterSecond.get(path), `the second sync moved ${path}`).toBe(hash);
      }
      expect(withoutClock(await readManifest(fixture.repoDir))).toEqual(withoutClock(upgraded));

      const check = await fixture.run(["check", "--json"]);
      expect(check.code, `check failed:\n${check.stdout}\n${check.stderr}`).toBe(0);
      expect(doctorRow(check.stdout, "manifest").status).toBe("pass");
      expect(doctorIds(check.stdout)).not.toContain("plugin-duplicates");
    } finally {
      await fixture.cleanup();
    }
  });
});
