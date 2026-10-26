import { existsSync } from "node:fs";
import { chmod, lstat, mkdir, readFile, readdir, rmdir, symlink, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  STATE_KEEP_FILE,
  STATE_SUBDIRS,
  ensureStateScaffold,
  removeStateScaffold,
  stateKeepPaths,
} from "../../src/emit/stateScaffold.ts";
import { STATE_DIR } from "../../src/types/markers.ts";
import { useTempDir } from "../support/tempDir.ts";

/**
 * The real-filesystem lane, not the virtual volume: this module is the one
 * emitter that talks to `node:fs/promises` directly rather than through an fs
 * seam, and every claim it makes is a syscall fact — `mkdir({ recursive })`
 * reporting whether THIS run created the directory, and `wx` refusing to
 * overwrite a placeholder an operator edited. A memfs stand-in would be
 * asserting memfs's reading of those flags rather than the platform's.
 *
 * The scaffold is deliberately unledgered (`test/emit/goldenFixture.ts` ->
 * `UNLEDGERED_ENGINE_PATHS`), so no golden or drift suite covers it: a missing
 * placeholder is an advisory "the stores rebuild on first write", not
 * missing-generated-file DRIFT. That is exactly why the behaviour needs stating
 * here — nothing else in the suite would notice if it stopped happening.
 */
const getTemp = useTempDir("emit-state-scaffold");

/** The placeholder body, verbatim. Pinned rather than imported: the module
 *  keeps the constant private, and this file IS committed into the operator's
 *  repository — a silent reword would reach every clone, so the test states the
 *  bytes a reader will find there. */
const KEEP_BODY =
  "# Keeps this directory in git, which tracks files rather than directories.\n" +
  "# The setup writes learnings and handoffs here; remove this file and the\n" +
  "# directory disappears from a fresh clone.\n";

/** chmod-based failure fixtures are meaningless as root, which bypasses the bits. */
const CAN_TEST_PERMISSIONS = typeof process.getuid === "function" && process.getuid() !== 0;

/** Absolute path of one state subdirectory under a fixture root. */
const dirIn = (root: string, name: string): string => join(root, STATE_DIR, name);

/** Absolute path of one placeholder under a fixture root. */
const keepIn = (root: string, name: string): string => join(dirIn(root, name), STATE_KEEP_FILE);

/** Both placeholder bodies, in declaration order — read together, so a missing
 *  one fails as a rejection rather than as a shorter list. */
const readKeeps = async (root: string): Promise<string[]> =>
  Promise.all(STATE_SUBDIRS.map((name) => readFile(keepIn(root, name), "utf-8")));

describe("STATE_SUBDIRS / stateKeepPaths", () => {
  it("names the two writable state stores, in creation order", () => {
    expect(STATE_SUBDIRS).toEqual(["learnings", "handoffs"]);
    expect(STATE_KEEP_FILE).toBe(".gitkeep");
  });

  it("reports repo-relative POSIX placeholder paths, one per subdirectory", () => {
    // POSIX separators on every host: these strings are compared against
    // manifest/ledger path keys, which are POSIX by contract, never joined with
    // the platform separator.
    expect(stateKeepPaths()).toEqual([
      `${STATE_DIR}/learnings/${STATE_KEEP_FILE}`,
      `${STATE_DIR}/handoffs/${STATE_KEEP_FILE}`,
    ]);
    expect(stateKeepPaths().every((path) => !path.includes("\\"))).toBe(true);
  });
});

describe("ensureStateScaffold", () => {
  it("creates both stores with their placeholders and reports both as new", async () => {
    const root = getTemp().dir;

    const created = await ensureStateScaffold(root);

    // Repo-relative, POSIX, in declaration order — this array is what init's
    // report prints as `createdDirs`, so its spelling is the contract.
    expect(created).toEqual([`${STATE_DIR}/learnings`, `${STATE_DIR}/handoffs`]);
    expect(await readKeeps(root)).toEqual([KEEP_BODY, KEEP_BODY]);
  });

  it("is a no-op on a second run: nothing reported, nothing disturbed", async () => {
    const root = getTemp().dir;
    await ensureStateScaffold(root);

    const created = await ensureStateScaffold(root);

    // `mkdir({ recursive })` answered `undefined` for both — the run added
    // nothing, so init has no created directory to announce. `sync` calls this
    // on every run, so a non-empty answer here would put a "created" line in
    // front of an operator on a repository where nothing changed.
    expect(created).toEqual([]);
    expect(await readKeeps(root)).toEqual([KEEP_BODY, KEEP_BODY]);
  });

  it("reports only the store a partial repository was missing", async () => {
    const root = getTemp().dir;
    // The half-scaffolded clone: `learnings` survived because a learning was
    // written into it, `handoffs` never held a file and vanished.
    await mkdir(dirIn(root, "learnings"), { recursive: true });

    const created = await ensureStateScaffold(root);

    expect(created).toEqual([`${STATE_DIR}/handoffs`]);
    // The surviving store still gains its placeholder: the directory existed,
    // the file did not, and the two answers are independent.
    expect(await readFile(keepIn(root, "learnings"), "utf-8")).toBe(KEEP_BODY);
  });

  it("keeps an operator's edited placeholder byte-for-byte", async () => {
    const root = getTemp().dir;
    const edited = "# our fork keeps handoffs out of git; this note says why\n";
    await mkdir(dirIn(root, "handoffs"), { recursive: true });
    await writeFile(keepIn(root, "handoffs"), edited, "utf-8");

    const created = await ensureStateScaffold(root);

    // `wx` raised EEXIST and the catch swallowed it: this scaffolds an absence,
    // it does not maintain a document, so the operator's bytes win.
    expect(await readFile(keepIn(root, "handoffs"), "utf-8")).toBe(edited);
    expect(created).toEqual([`${STATE_DIR}/learnings`]);
  });

  it.skipIf(!CAN_TEST_PERMISSIONS)(
    "rethrows a write failure that is not EEXIST",
    async () => {
      const root = getTemp().dir;
      const denied = dirIn(root, "learnings");
      await mkdir(denied, { recursive: true });
      // A read-only store drives the failure deterministically and with a code
      // the catch must NOT swallow: the directory exists, so `mkdir` returns
      // `undefined` without complaint and the `wx` open is what fails. Only
      // EEXIST means "already scaffolded"; anything else is a real fault, and
      // swallowing it would report a scaffold that never landed.
      await chmod(denied, 0o555);

      try {
        await expect(ensureStateScaffold(root)).rejects.toMatchObject({ code: "EACCES" });
        expect(existsSync(keepIn(root, "learnings"))).toBe(false);
      } finally {
        await chmod(denied, 0o755);
      }
    },
  );

  it("touches nothing on a dry run and reports what it would have created", async () => {
    const root = getTemp().dir;

    const planned = await ensureStateScaffold(root, { dryRun: true });

    expect(planned).toEqual([`${STATE_DIR}/learnings`, `${STATE_DIR}/handoffs`]);
    // Not "the placeholders are absent" — the whole state directory is, so a
    // dry run over a fresh repository leaves no evidence it ran at all.
    expect(await readdir(root)).toEqual([]);
  });

  it("reports the same directories on a dry run whether or not they exist", async () => {
    const root = getTemp().dir;
    await ensureStateScaffold(root);

    // A dry run answers from the declaration, not from disk: it is a preview of
    // the paths the verb covers, not a diff against the current tree.
    expect(await ensureStateScaffold(root, { dryRun: true })).toEqual([
      `${STATE_DIR}/learnings`,
      `${STATE_DIR}/handoffs`,
    ]);
  });
});

describe("removeStateScaffold (REQ-FLOW-028)", () => {
  it("unlinks each placeholder that still holds the scaffold's bytes, reports it, and leaves its folder", async () => {
    const root = getTemp().dir;
    await ensureStateScaffold(root);

    const removed = await removeStateScaffold(root);

    expect(removed).toEqual({ removed: stateKeepPaths(), linked: [] });
    for (const name of STATE_SUBDIRS) {
      expect(existsSync(keepIn(root, name))).toBe(false);
      // The folder is the caller's to prune once it is empty: a learning beside the placeholder keeps it.
      expect(existsSync(dirIn(root, name))).toBe(true);
    }
  });

  it("keeps an edited placeholder and a link at the placeholder's name, and passes over a missing one", async () => {
    const root = getTemp().dir;
    await ensureStateScaffold(root);
    const edited = "# our team's note on why handoffs are committed\n";
    await writeFile(keepIn(root, "handoffs"), edited, "utf-8");
    // A link standing where the placeholder was, aimed at a file with the scaffold's very bytes: not the file the setup wrote.
    const outside = getTemp().path("outside-keep");
    await writeFile(outside, KEEP_BODY, "utf-8");
    await unlink(keepIn(root, "learnings"));
    await symlink(outside, keepIn(root, "learnings"));

    expect(await removeStateScaffold(root)).toEqual({ removed: [], linked: [] });
    expect(await readFile(keepIn(root, "handoffs"), "utf-8")).toBe(edited);
    expect((await lstat(keepIn(root, "learnings"))).isSymbolicLink()).toBe(true);
    expect(await readFile(outside, "utf-8")).toBe(KEEP_BODY);

    const bare = getTemp().path("bare");
    await mkdir(bare, { recursive: true });
    expect(await removeStateScaffold(bare)).toEqual({ removed: [], linked: [] });
  });

  it.skipIf(process.platform === "win32")(
    "never looks into a store folder that is a link, and returns it as linked (review/60)",
    async () => {
      const root = getTemp().dir;
      await ensureStateScaffold(root);
      // Another checkout's store, holding a placeholder with the scaffold's very bytes.
      const shared = getTemp().path("shared-learnings");
      await mkdir(shared, { recursive: true });
      await writeFile(join(shared, STATE_KEEP_FILE), KEEP_BODY, "utf-8");
      await unlink(keepIn(root, "learnings"));
      await rmdir(dirIn(root, "learnings"));
      await symlink(shared, dirIn(root, "learnings"));

      expect(await removeStateScaffold(root)).toEqual({ removed: [`${STATE_DIR}/handoffs/${STATE_KEEP_FILE}`], linked: [`${STATE_DIR}/learnings/`] });
      expect(await readFile(join(shared, STATE_KEEP_FILE), "utf-8")).toBe(KEEP_BODY);
    },
  );

  it("passes over a store name that is a file, and a store folder with no placeholder", async () => {
    const root = getTemp().dir;
    await mkdir(join(root, STATE_DIR), { recursive: true });
    await writeFile(dirIn(root, "learnings"), "the owner's own file\n", "utf-8");
    await mkdir(dirIn(root, "handoffs"));

    expect(await removeStateScaffold(root)).toEqual({ removed: [], linked: [] });
    expect(await readFile(dirIn(root, "learnings"), "utf-8")).toBe("the owner's own file\n");
    expect(existsSync(dirIn(root, "handoffs"))).toBe(true);
  });

  it.skipIf(!CAN_TEST_PERMISSIONS)("rethrows a removal failure that is not ENOENT", async () => {
    const root = getTemp().dir;
    await ensureStateScaffold(root);
    await chmod(dirIn(root, "handoffs"), 0o555);

    try {
      await expect(removeStateScaffold(root)).rejects.toMatchObject({ code: "EACCES" });
      expect(await readFile(keepIn(root, "handoffs"), "utf-8")).toBe(KEEP_BODY);
    } finally {
      await chmod(dirIn(root, "handoffs"), 0o755);
    }
  });
});
