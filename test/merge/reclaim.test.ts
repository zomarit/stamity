import { createHash } from "node:crypto";
import { chmod, link, lstat, mkdir, readFile, readdir, rm, symlink } from "node:fs/promises";
// Namespace import of the REAL module, so the one case that has to change the
// tree mid-sweep can delegate to the unpatched calls from inside its replacement.
import * as realFsPromises from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { ReclaimCandidate } from "../../src/manifest/ledger.ts";
import { OWNED_PATHS } from "../../src/manifest/ownedPaths.ts";
import type * as ReclaimApi from "../../src/merge/reclaim.ts";
import { wrapInManagedBlock } from "../../src/merge/managedBlocks.ts";
import {
  formatReclaimReport,
  sweepReclaimCandidates,
  type ReclaimActionEntry,
  type ReclaimReport,
} from "../../src/merge/reclaim.ts";
import type { CoOwnedReducer, CoOwnedReduction } from "../../src/types/content.ts";
import type { Tool } from "../../src/types/core.ts";
import { EngineError } from "../../src/types/errors.ts";
import { useTempDir } from "../support/tempDir.ts";

/**
 * Real-filesystem lane throughout. The sweep's whole contract is about disk:
 * symlinks that escape the root, `lstat` file-type discrimination, directories
 * that must survive a delete, and an atomic strip that leaves the original bytes
 * behind on failure — none of which an in-memory volume expresses faithfully.
 *
 * The fixture root is `<temp>/repo`, so `<temp>/outside` gives every escape test
 * a real target that is genuinely outside the repo while still inside the
 * directory the harness cleans up.
 *
 * The recursive snapshot walk below is ordered by necessity (a directory must be
 * read before its children), so `no-await-in-loop` is off for the file exactly as
 * it is in the subject.
 */
/* oxlint-disable no-await-in-loop */

const tempDir = useTempDir("stamity-reclaim");

/** chmod-based failure fixtures are meaningless as root, which bypasses the bits. */
const CAN_TEST_PERMISSIONS = typeof process.getuid === "function" && process.getuid() !== 0;

/**
 * The artifact type a release records at `path`: a content class under a
 * content folder, `infra` everywhere else.
 *
 * TEST CHANGE, justified: REQ-PLUGIN-045 — the sweep now refuses at gate 1 a
 * row outside the owned-path bound, which reads the row's type: a content row
 * only under a content folder, an `infra` row only at a platform file, a
 * charter or a state folder. The helpers typed every row `rule`, so a `.mcp.json`
 * or `.stamity/mcp/…` fixture became a row no release writes; they now type
 * each row the way a release records it at that path, and no case's subject
 * changes with it.
 */
function recordedTypeAt(path: string): "rule" | "infra" {
  return OWNED_PATHS.contentRoots.some((root) => path.startsWith(root)) ? "rule" : "infra";
}

/** A ledger row the sweep may act on. Defaults describe the common case: one
 *  cursor-owned rule the current emission no longer produces. */
function candidate(
  path: string,
  reason: ReclaimCandidate["reason"] = "deselected",
  adapter: Tool = "cursor",
): ReclaimCandidate {
  return {
    entry: { path, adapter, artifactId: `artifact:${path}`, artifactType: recordedTypeAt(path) },
    reason,
  };
}

function sha256Of(content: string): string {
  return createHash("sha256").update(Buffer.from(content, "utf8")).digest("hex");
}

/**
 * The same row recording the hash of `content`, as every release records one.
 *
 * TEST CHANGE, justified: REQ-PLUGIN-045 — a row with no content hash proves
 * nothing, so an engine-named block-less file is deleted only beside a matching
 * hash. The cases whose subject is that delete (pruning, the renamed spelling,
 * the nested skill reference) record the hash a release would have recorded;
 * their assertions are unchanged.
 */
function recorded(row: ReclaimCandidate, content: string): ReclaimCandidate {
  return { ...row, entry: { ...row.entry, contentHash: sha256Of(content) } };
}

const PACK_FILE = ".stamity/packs/acme__ops/agents/reviewer.md";
const PACK_BODY = "---\nid: reviewer\n---\nReview the change.\n";

/**
 * The smallest bytes the charter recogniser reads as the engine's: the title
 * line and the four headings every release's charter carries, in order
 * (`../../src/manifest/ownedPaths.ts::isEngineCharterDocument`, REQ-PLUGIN-046).
 */
const CHARTER_BODY = "# Charter\n\n## Repo facts\n\n## Invariants\n\n## Touchpoints\n\n## Conditional layer\n";

/**
 * A row for content the engine installed verbatim: a name it did not mint, no
 * managed block, and the hash of the bytes it wrote. The recorded hash is the
 * only ownership proof such a file has.
 *
 * TEST CHANGE, justified: REQ-PLUGIN-045 — the owner follows the path, since a
 * `pack:<id>` row lies only in its own pack folder: a pack row under
 * `.stamity/packs/acme__ops/`, a `claude` row of the recorded type anywhere
 * else (`AGENTS.md`, a cursor rule). The hash, the subject of these cases, is
 * unchanged.
 */
function hashedCandidate(path: string, content: string): ReclaimCandidate {
  const inPack = path.startsWith(`${OWNED_PATHS.packRoot}acme__ops/`);
  return {
    entry: {
      path,
      adapter: inPack ? "pack:@acme/ops" : "claude",
      artifactId: inPack ? "@acme/ops/agents/reviewer.md" : `artifact:${path}`,
      artifactType: inPack ? "infra" : recordedTypeAt(path),
      contentHash: sha256Of(content),
    },
    reason: "deselected",
  };
}

/**
 * Every path under `dir` as `relative/posix/path` -> content. Directories are
 * recorded with a trailing-slash key and an empty value so a snapshot comparison
 * also catches a directory that was pruned; symlinks are recorded by marker
 * rather than followed, so an escape fixture cannot leak outside content in.
 */
async function snapshot(dir: string): Promise<Record<string, string>> {
  const seen: Record<string, string> = {};
  const walk = async (current: string): Promise<void> => {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const abs = join(current, entry.name);
      const key = relative(dir, abs).split(sep).join("/");
      if (entry.isSymbolicLink()) {
        seen[key] = "<symlink>";
      } else if (entry.isDirectory()) {
        seen[`${key}/`] = "";
        await walk(abs);
      } else {
        seen[key] = await readFile(abs, "utf-8");
      }
    }
  };
  await walk(dir);
  return seen;
}

/** The one entry the report holds, asserted to be the only one. */
function onlyEntry(report: ReclaimReport): ReclaimActionEntry {
  expect(report.entries).toHaveLength(1);
  return report.entries[0] as ReclaimActionEntry;
}

/** Fully engine-owned output: a managed block and nothing else. */
function managedWhole(body: string): string {
  return wrapInManagedBlock(body);
}

describe("sweepReclaimCandidates — consent gate", () => {
  it("writes nothing and reports every candidate as dry-run without consent", async () => {
    const temp = tempDir();
    const root = temp.path("repo");
    await temp.seedFiles({
      "repo/.cursor/rules/50-stamity-testing.mdc": managedWhole("engine rule"),
      "repo/.claude/agents/stamity-implementer.md": "whole-file engine output\n",
      "repo/.stamity/mcp/stamity-servers.json": "{}\n",
    });
    const before = await snapshot(root);

    const report = await sweepReclaimCandidates(
      [
        candidate(".cursor/rules/50-stamity-testing.mdc"),
        // TEST CHANGE, justified: REQ-PLUGIN-045 — the two block-less files
        // record the hash of their bytes, which their delete now needs.
        recorded(
          candidate(".claude/agents/stamity-implementer.md", "adapter-removed", "claude"),
          "whole-file engine output\n",
        ),
        recorded(candidate(".stamity/mcp/stamity-servers.json"), "{}\n"),
      ],
      { rootDir: root, consent: false },
    );

    expect(report.entries.map((entry) => entry.action)).toEqual(["dry-run", "dry-run", "dry-run"]);
    expect(report).toMatchObject({ deletedCount: 0, strippedCount: 0, skippedCount: 0 });
    expect(await snapshot(root)).toEqual(before);
  });

  it("previews the action consent would unlock, per candidate", async () => {
    const temp = tempDir();
    const root = temp.path("repo");
    await temp.seedFiles({
      "repo/.cursor/rules/50-stamity-testing.mdc": managedWhole("engine rule"),
      "repo/.claude/agents/stamity-reviewer.md": `user prose\n${managedWhole("engine body")}`,
    });

    const report = await sweepReclaimCandidates(
      [
        candidate(".cursor/rules/50-stamity-testing.mdc"),
        candidate(".claude/agents/stamity-reviewer.md"),
        candidate(".cursor/rules/50-stamity-gone.mdc"),
      ],
      { rootDir: root, consent: false },
    );

    expect(report.entries[0]?.detail).toContain("would delete this path");
    expect(report.entries[1]?.detail).toContain("would strip the managed block");
    // What consent would take, and what proves it, on the preview itself.
    expect(report.entries[0]).toMatchObject({ wouldBe: "deleted", proof: "block" });
    expect(report.entries[1]).toMatchObject({ wouldBe: "managed-block-stripped", proof: "block" });
    expect(report.entries[2]).not.toHaveProperty("proof");
    // A candidate that fails a gate reports the refusal itself, never a preview:
    // consent cannot unlock a path the sweep already refused.
    expect(report.entries[2]?.action).toBe("skipped-missing");
  });
});

describe("sweepReclaimCandidates — user-content veto", () => {
  const USER_BEFORE = "# Team additions\n\nkeep me\n";
  const USER_AFTER = "## Local overrides\n\nalso keep me\n";

  it("strips the managed block and preserves the surrounding user bytes exactly", async () => {
    const temp = tempDir();
    const root = temp.path("repo");
    const path = ".claude/agents/stamity-reviewer.md";
    await temp.seedFiles({
      [`repo/${path}`]: `${USER_BEFORE}${managedWhole("engine body")}${USER_AFTER}`,
    });

    const report = await sweepReclaimCandidates([candidate(path)], {
      rootDir: root,
      consent: true,
    });

    expect(onlyEntry(report).action).toBe("managed-block-stripped");
    expect(report).toMatchObject({ deletedCount: 0, strippedCount: 1, skippedCount: 0 });
    // Both user runs survive byte-for-byte. The single newline between them is
    // the one that terminated the END marker line — the block is excised, the
    // bytes on either side of it are never rewritten.
    expect(await readFile(join(root, path), "utf-8")).toBe(`${USER_BEFORE}\n${USER_AFTER}`);
  });

  it.skipIf(process.platform === "win32")(
    "strips the block without relaxing the file's mode",
    async () => {
      const temp = tempDir();
      const root = temp.path("repo");
      const path = ".claude/agents/stamity-reviewer.md";
      await temp.seedFiles({
        [`repo/${path}`]: `${USER_BEFORE}${managedWhole("engine body")}${USER_AFTER}`,
      });
      await chmod(join(root, path), 0o600);

      const report = await sweepReclaimCandidates([candidate(path)], {
        rootDir: root,
        consent: true,
      });

      // The strip preserves the user's bytes by REWRITING them, which lands a
      // fresh inode: the sweep used to publish it at its own default, so a file
      // the operator had made private came back world-readable as a side effect
      // of removing a block. The bits belong to the file, not to the sweep.
      expect(onlyEntry(report).action).toBe("managed-block-stripped");
      expect((await lstat(join(root, path))).mode & 0o777).toBe(0o600);
      expect(await readFile(join(root, path), "utf-8")).toBe(`${USER_BEFORE}\n${USER_AFTER}`);
    },
  );

  it("deletes a file whose managed block spans it, user-content check passing", async () => {
    const temp = tempDir();
    const root = temp.path("repo");
    await temp.seedFiles({
      "repo/.cursor/rules/50-stamity-testing.mdc": managedWhole("engine rule"),
    });

    const report = await sweepReclaimCandidates(
      [candidate(".cursor/rules/50-stamity-testing.mdc")],
      { rootDir: root, consent: true },
    );

    expect(onlyEntry(report).action).toBe("deleted");
    expect(await snapshot(root)).toEqual({});
  });

  it("treats a generated frontmatter stub above the block as engine-authored", async () => {
    const temp = tempDir();
    const root = temp.path("repo");
    const stub = "---\ndescription: generated picker stub\n---\n";
    await temp.seedFiles({
      "repo/.claude/skills/stamity-review/SKILL.md": `${stub}${managedWhole("engine body")}`,
    });

    const report = await sweepReclaimCandidates(
      [candidate(".claude/skills/stamity-review/SKILL.md")],
      { rootDir: root, consent: true },
    );

    // Without this carve-out the emission's own frontmatter would veto every
    // skill reclaim forever, leaving deselected skills on disk permanently.
    expect(onlyEntry(report).action).toBe("deleted");
    expect(await snapshot(root)).toEqual({});
  });

  it("keeps user prose that follows a frontmatter stub", async () => {
    const temp = tempDir();
    const root = temp.path("repo");
    const path = ".claude/skills/stamity-review/SKILL.md";
    const prefix = "---\ndescription: generated picker stub\n---\n\nmy own notes\n";
    await temp.seedFiles({ [`repo/${path}`]: `${prefix}${managedWhole("engine body")}` });

    const report = await sweepReclaimCandidates([candidate(path)], {
      rootDir: root,
      consent: true,
    });

    expect(onlyEntry(report).action).toBe("managed-block-stripped");
    // Same seam as above: the prefix survives byte-for-byte, followed by the
    // newline that terminated the END marker line.
    expect(await readFile(join(root, path), "utf-8")).toBe(`${prefix}\n`);
  });
});

describe("sweepReclaimCandidates — containment", () => {
  it("refuses a candidate reached through a symlinked directory and leaves it untouched", async () => {
    const temp = tempDir();
    const root = temp.path("repo");
    await temp.seedFiles({
      "outside/rules/stamity-secret.mdc": "not ours\n",
      "repo/.stamity/mcp/stamity-servers.json": "{}\n",
    });
    await symlink(temp.path("outside"), join(root, ".cursor"), "dir");

    const report = await sweepReclaimCandidates([candidate(".cursor/rules/stamity-secret.mdc")], {
      rootDir: root,
      consent: true,
    });

    const entry = onlyEntry(report);
    expect(entry.action).toBe("skipped-unsafe-path");
    expect(entry.detail).toContain("outside the repo root");
    expect(report.skippedCount).toBe(1);
    expect(await readFile(temp.path("outside/rules/stamity-secret.mdc"), "utf-8")).toBe("not ours\n");
  });

  // The bound is lexical, so gate 3 holds the resolved parent inside the
  // resolved folder the row claims: a committed directory link under one state
  // folder cannot carry a hashed delete into an owner's learnings.
  it("refuses a hashed state row reached through a directory link inside its folder", async () => {
    const temp = tempDir();
    const root = temp.path("repo");
    const owner = "owner learning\n";
    await temp.seedFiles({ "repo/.stamity/learnings/keep-me.md": owner });
    await mkdir(join(root, ".stamity/generated"), { recursive: true });
    await symlink(join(root, ".stamity/learnings"), join(root, ".stamity/generated/x"), "dir");

    const report = await sweepReclaimCandidates([hashedCandidate(".stamity/generated/x/keep-me.md", owner)], {
      rootDir: root,
      consent: true,
    });

    expect(onlyEntry(report).action).toBe("skipped-unsafe-path");
    expect(onlyEntry(report).detail).toContain("the folder the row's path lies in");
    expect(await readFile(join(root, ".stamity/learnings/keep-me.md"), "utf-8")).toBe(owner);
  });

  // The engine's own folders are never links: a link at `.stamity/`, at a state
  // folder or at a pack's folder would move the folder the row claims along
  // with it, and the hash alone proves a delete there.
  it.each([
    // [the linked folder, its target, the row's path, the owner file the row reaches]
    [".stamity/generated", ".stamity/learnings", ".stamity/generated/keep-me.md", ".stamity/learnings/keep-me.md"],
    [".stamity", "owner-state", ".stamity/mcp/keep-me.md", "owner-state/mcp/keep-me.md"],
    [".stamity/packs/acme__ops", "docs", `${OWNED_PATHS.packRoot}acme__ops/keep-me.md`, "docs/keep-me.md"],
  ])("refuses a hashed row under %j when that folder is itself a link", async (linked, target, rowPath, ownerFile) => {
    const temp = tempDir();
    const root = temp.path("repo");
    const owner = "owner file\n";
    await temp.seedFiles({ [`repo/${ownerFile}`]: owner });
    await mkdir(join(root, linked, ".."), { recursive: true });
    await symlink(join(root, target), join(root, linked), "dir");

    const report = await sweepReclaimCandidates([hashedCandidate(rowPath, owner)], { rootDir: root, consent: true });

    expect(onlyEntry(report).action).toBe("skipped-unsafe-path");
    expect(onlyEntry(report).detail).toContain(`\`${linked}\` is a symbolic link`);
    expect(await readFile(join(root, ownerFile), "utf-8")).toBe(owner);
  });

  it("still reclaims through a content folder that is itself an in-repo alias", async () => {
    const temp = tempDir();
    const root = temp.path("repo");
    await temp.seedFiles({ "repo/shared/rules/stamity-x.mdc": managedWhole("rule") });
    await mkdir(join(root, ".cursor"), { recursive: true });
    await symlink(join(root, "shared/rules"), join(root, ".cursor/rules"), "dir");

    const report = await sweepReclaimCandidates([candidate(".cursor/rules/stamity-x.mdc")], {
      rootDir: root,
      consent: true,
    });

    expect(onlyEntry(report)).toMatchObject({ action: "deleted", proof: "block" });
    expect(Object.keys(await snapshot(root))).not.toContain("shared/rules/stamity-x.mdc");
  });

  // A case-insensitive volume answers the row's spelling with a file spelled
  // otherwise; the folder's listing is the spelling on disk. Runs where the
  // temp volume folds case (APFS, NTFS by default); the injected listing in
  // `coverageGaps.test.ts` holds the branch on every volume.
  it("keeps an owner's file a hashed row reaches only by another spelling", async (ctx) => {
    const temp = tempDir();
    const root = temp.path("repo");
    const owner = "owner notes\n";
    await temp.seedFiles({ "repo/.claude/agents/Stamity-Notes.md": owner });
    const folds = await lstat(join(root, ".claude/agents/stamity-notes.md")).then(
      () => true,
      () => false,
    );
    if (!folds) ctx.skip();

    const row = recorded(candidate(".claude/agents/stamity-notes.md", "deselected", "claude"), owner);
    const report = await sweepReclaimCandidates([row], { rootDir: root, consent: true });

    expect(onlyEntry(report).action).toBe("skipped-unsafe-path");
    expect(onlyEntry(report).detail).toContain("spelled exactly `stamity-notes.md`");
    expect(await snapshot(root)).toEqual({
      ".claude/": "",
      ".claude/agents/": "",
      ".claude/agents/Stamity-Notes.md": owner,
    });
  });

  it("refuses a symlink standing in for the recorded file", async () => {
    const temp = tempDir();
    const root = temp.path("repo");
    await temp.seedFiles({ "outside/secret.md": "not ours\n" });
    await mkdir(join(root, ".claude/agents"), { recursive: true });
    await symlink(temp.path("outside/secret.md"), join(root, ".claude/agents/stamity-evil.md"));

    const report = await sweepReclaimCandidates([candidate(".claude/agents/stamity-evil.md")], {
      rootDir: root,
      consent: true,
    });

    expect(onlyEntry(report)).toMatchObject({ action: "skipped-unsafe-path" });
    expect(onlyEntry(report).detail).toContain("symbolic link");
    expect(await readFile(temp.path("outside/secret.md"), "utf-8")).toBe("not ours\n");
    // The link itself is left in place too — the sweep does not act on the path at all.
    expect(await snapshot(root)).toMatchObject({ ".claude/agents/stamity-evil.md": "<symlink>" });
  });

  it.each([
    ["../outside/secret.md", "climbs out of the repo"],
    ["/etc/hosts", "is an absolute path"],
    ["C:/Windows/stamity-x.md", "is an absolute path"],
    [".cursor\\rules\\stamity-x.mdc", "backslash separator"],
    ["", "is empty"],
  ])("refuses the malformed ledger path %j before touching disk", async (path, reason) => {
    const temp = tempDir();
    const root = temp.path("repo");
    await temp.seedFiles({ "outside/secret.md": "not ours\n", "repo/keep.md": "keep\n" });
    const before = await snapshot(root);

    const report = await sweepReclaimCandidates([candidate(path)], {
      rootDir: root,
      consent: true,
    });

    const entry = onlyEntry(report);
    expect(entry.action).toBe("skipped-unsafe-path");
    expect(entry.detail).toContain(reason);
    expect(await snapshot(root)).toEqual(before);
    expect(await readFile(temp.path("outside/secret.md"), "utf-8")).toBe("not ours\n");
  });

  // TEST CHANGE, justified: REQ-PLUGIN-045 — `docs/README.md` now stops at
  // gate 1 (outside the owned-path bound, its own case below), so the
  // marker-less file of this case moved into a content folder, where gate 2 is
  // still the gate that refuses it.
  it("refuses a path whose basename carries no ownership marker", async () => {
    const temp = tempDir();
    const root = temp.path("repo");
    await temp.seedFiles({ "repo/.cursor/rules/README.md": "user doc\n" });

    const report = await sweepReclaimCandidates([candidate(".cursor/rules/README.md")], {
      rootDir: root,
      consent: true,
    });

    expect(onlyEntry(report).detail).toContain("ownership marker");
    expect(await readFile(join(root, ".cursor/rules/README.md"), "utf-8")).toBe("user doc\n");
  });

  it.each([
    ["an infra row outside every platform file and state folder", "docs/README.md", "claude", "infra"],
    ["a content row outside every content folder", "notes/st-owner.md", "claude", "rule"],
    ["an infra row in a state folder the engine does not write", ".stamity/learnings/keep-me.md", "claude", "infra"],
    ["a content row in a state folder", ".stamity/generated/stamity-x.md", "claude", "skill"],
    ["an infra row in a content folder", ".claude/agents/stamity-x.md", "claude", "infra"],
    ["a pack row in another pack's folder", ".stamity/packs/other/x.md", "pack:ops", "infra"],
    ["a tool row in a pack's folder", ".stamity/packs/ops/x.md", "claude", "infra"],
  ] as const)("refuses %s at gate 1, even with a matching hash", async (_label, path, adapter, artifactType) => {
    const temp = tempDir();
    const root = temp.path("repo");
    await temp.seedFiles({ [`repo/${path}`]: "owner bytes\n" });
    const before = await snapshot(root);

    const report = await sweepReclaimCandidates(
      [
        {
          entry: { path, adapter, artifactId: "forged", artifactType, contentHash: sha256Of("owner bytes\n") },
          reason: "adapter-removed",
        },
      ],
      { rootDir: root, consent: true, trustedExactPaths: new Set([path]) },
    );

    const entry = onlyEntry(report);
    expect(entry.action).toBe("skipped-unsafe-path");
    expect(entry.detail).toContain("lies outside the paths the engine writes");
    expect(entry).not.toHaveProperty("proof");
    expect(await snapshot(root)).toEqual(before);
  });

  it("refuses the whole path when one of the rows naming it lies outside the bound", async () => {
    const temp = tempDir();
    const root = temp.path("repo");
    await temp.seedFiles({ "repo/.cursor/rules/50-stamity-testing.mdc": managedWhole("engine rule") });

    const report = await sweepReclaimCandidates(
      [
        candidate(".cursor/rules/50-stamity-testing.mdc"),
        {
          entry: {
            path: ".cursor/rules/50-stamity-testing.mdc",
            adapter: "claude",
            artifactId: "forged",
            artifactType: "infra",
          },
          reason: "deselected",
        },
      ],
      { rootDir: root, consent: true },
    );

    expect(onlyEntry(report).action).toBe("skipped-unsafe-path");
    expect(await readFile(join(root, ".cursor/rules/50-stamity-testing.mdc"), "utf-8")).toBe(
      managedWhole("engine rule"),
    );
  });

  it("does not read the marker off an ancestor directory that merely carries the prefix", async () => {
    const temp = tempDir();
    const root = temp.path("repo");
    // A directory the USER named after the engine, holding a file the engine
    // never wrote. The marker used to be read off any segment, so this cleared
    // gate 2 and reached the whole-file delete branch on the strength of a name
    // that says nothing about the file underneath it.
    // TEST CHANGE, justified: REQ-PLUGIN-045 — a root-level `stamity-tools/`
    // now stops at gate 1, so the user's folder sits inside a content folder,
    // where the provisional-ancestor rule is still what keeps the file.
    await temp.seedFiles({ "repo/.claude/rules/stamity-tools/user.md": "mine\n" });

    const report = await sweepReclaimCandidates([candidate(".claude/rules/stamity-tools/user.md")], {
      rootDir: root,
      consent: true,
    });

    const entry = onlyEntry(report);
    expect(report.deletedCount).toBe(0);
    expect(entry.action).toBe("skipped-user-content");
    // The prefixed directory keeps the sweep reading, and the bytes then have to
    // close the claim; they do not, so the file stays.
    expect(entry.detail).toContain("the directory, not this file");
    expect(await readFile(join(root, ".claude/rules/stamity-tools/user.md"), "utf-8")).toBe("mine\n");
  });

  it("still reclaims the same shape once the bytes prove the engine wrote it", async () => {
    const temp = tempDir();
    const root = temp.path("repo");
    // The other half of the provisional rule: a prefixed container is a hint,
    // and a managed block spanning the file is the proof that closes it.
    // TEST CHANGE, justified: REQ-PLUGIN-045 — the same move into a content
    // folder as the case above.
    await temp.seedFiles({ "repo/.claude/rules/stamity-tools/emitted.md": managedWhole("engine body") });

    const report = await sweepReclaimCandidates([candidate(".claude/rules/stamity-tools/emitted.md")], {
      rootDir: root,
      consent: true,
    });

    expect(onlyEntry(report).action).toBe("deleted");
    expect(await snapshot(root)).toEqual({});
  });
});

describe("sweepReclaimCandidates — deletion and directory pruning", () => {
  it("deletes fully-managed candidates and prunes emptied parents, sparing the state dir", async () => {
    const temp = tempDir();
    const root = temp.path("repo");
    await temp.seedFiles({
      "repo/.cursor/rules/50-stamity-testing.mdc": managedWhole("engine rule"),
      "repo/.stamity/mcp/stamity-servers.json": "{}\n",
    });

    const report = await sweepReclaimCandidates(
      [
        candidate(".cursor/rules/50-stamity-testing.mdc"),
        // TEST CHANGE, justified: REQ-PLUGIN-045 — the block-less state file
        // records the hash of its bytes, which its delete now needs.
        recorded(candidate(".stamity/mcp/stamity-servers.json", "adapter-removed", "claude"), "{}\n"),
      ],
      { rootDir: root, consent: true },
    );

    expect(report).toMatchObject({ deletedCount: 2, strippedCount: 0, skippedCount: 0 });
    // `.cursor` and `.cursor/rules` are emptied and go; `.stamity/mcp` goes too,
    // but the walk stops at `.stamity` — the state directory holds the manifest
    // that drove this sweep and is never removed, even when left empty.
    expect(await snapshot(root)).toEqual({ ".stamity/": "" });
  });

  it("stops pruning at a directory that still holds a sibling", async () => {
    const temp = tempDir();
    const root = temp.path("repo");
    await temp.seedFiles({
      "repo/.cursor/rules/50-stamity-testing.mdc": managedWhole("engine rule"),
      "repo/.cursor/rules/user-authored.mdc": "mine\n",
    });

    await sweepReclaimCandidates([candidate(".cursor/rules/50-stamity-testing.mdc")], {
      rootDir: root,
      consent: true,
    });

    expect(await snapshot(root)).toEqual({
      ".cursor/": "",
      ".cursor/rules/": "",
      ".cursor/rules/user-authored.mdc": "mine\n",
    });
  });

  it("deletes a skill body through its prefixed directory and prunes the directory", async () => {
    const temp = tempDir();
    const root = temp.path("repo");
    await temp.seedFiles({
      "repo/.claude/skills/stamity-review/SKILL.md": managedWhole("engine body"),
    });

    const report = await sweepReclaimCandidates(
      [candidate(".claude/skills/stamity-review/SKILL.md")],
      { rootDir: root, consent: true },
    );

    expect(onlyEntry(report).action).toBe("deleted");
    expect(await snapshot(root)).toEqual({});
  });

  it("refuses a SKILL.md under a directory the engine did not name", async () => {
    const temp = tempDir();
    const root = temp.path("repo");
    await temp.seedFiles({ "repo/.claude/skills/my-skill/SKILL.md": "mine\n" });

    const report = await sweepReclaimCandidates([candidate(".claude/skills/my-skill/SKILL.md")], {
      rootDir: root,
      consent: true,
    });

    expect(onlyEntry(report).action).toBe("skipped-unsafe-path");
    expect(await readFile(join(root, ".claude/skills/my-skill/SKILL.md"), "utf-8")).toBe("mine\n");
  });

  // The marker is read off an engine-minted SKILL directory — a prefixed
  // segment sitting directly under `skills/` — at any depth below it. A
  // projected skill is one artifact spread over such a directory: `SKILL.md`
  // beside it and `references/*.md` a level deeper, none of them individually
  // prefixed. Reading the marker off the file alone made depth decide
  // reclaimability, so an uninstall deleted a skill's `SKILL.md` and left its
  // own reference files orphaned on disk. The `skills/` anchor is what keeps
  // this from re-admitting any prefixed ancestor — see the `stamity-tools/`
  // case in the ownership-marker suite.
  it("deletes a skill reference nested below the prefixed directory", async () => {
    const temp = tempDir();
    const root = temp.path("repo");
    await temp.seedFiles({
      "repo/.agents/skills/stamity-verify/references/ui.md": "# UI\n\nengine reference body\n",
    });

    // TEST CHANGE, justified: REQ-PLUGIN-045 — the block-less reference
    // records the hash of its bytes; the name proof needs one beside it.
    const report = await sweepReclaimCandidates(
      [recorded(candidate(".agents/skills/stamity-verify/references/ui.md"), "# UI\n\nengine reference body\n")],
      { rootDir: root, consent: true },
    );

    expect(onlyEntry(report).action).toBe("deleted");
    expect(await snapshot(root)).toEqual({});
  });

  // The invocable surfaces (commands, skills) are emitted under `st-`, the
  // rest of the corpus under `stamity-`. The ownership gate reads a NAME, not
  // a class, so it has to admit both spellings: a `.claude/commands/st-work.md`
  // the engine just minted is exactly as engine-owned as the
  // `stamity-work.md` it replaced, and a gate that knows only the old prefix
  // turns every new emission into an orphan nothing may delete.
  it("deletes a command file carrying the invocable prefix", async () => {
    const temp = tempDir();
    const root = temp.path("repo");
    await temp.seedFiles({
      "repo/.claude/commands/st-work.md": managedWhole("engine command"),
    });

    const report = await sweepReclaimCandidates([candidate(".claude/commands/st-work.md")], {
      rootDir: root,
      consent: true,
    });

    expect(onlyEntry(report).action).toBe("deleted");
    expect(await snapshot(root)).toEqual({});
  });

  // The upgrade path, end to end. A repo installed before the invocable
  // surfaces moved to `st-` holds `.claude/commands/stamity-work.md` and
  // `.agents/skills/stamity-verify/`; the next sync emits the `st-` spellings
  // and the ledger hands the old paths back under `path-renamed`. If the gate
  // did not still admit the OLD prefix, every upgraded repo would keep both
  // spellings side by side — nine duplicated touchpoints, and a user picking
  // the dead one from the picker.
  it("retires the previous spelling of a renamed command and skill", async () => {
    const temp = tempDir();
    const root = temp.path("repo");
    await temp.seedFiles({
      "repo/.claude/commands/stamity-work.md": managedWhole("engine command"),
      "repo/.agents/skills/stamity-verify/SKILL.md": managedWhole("engine skill"),
      "repo/.agents/skills/stamity-verify/references/ui.md": "# UI\n\nengine reference body\n",
    });

    const report = await sweepReclaimCandidates(
      [
        candidate(".claude/commands/stamity-work.md", "path-renamed", "claude"),
        candidate(".agents/skills/stamity-verify/SKILL.md", "path-renamed", "claude"),
        // TEST CHANGE, justified: REQ-PLUGIN-045 — the block-less reference
        // records the hash of its bytes; the name proof needs one beside it.
        recorded(
          candidate(".agents/skills/stamity-verify/references/ui.md", "path-renamed", "claude"),
          "# UI\n\nengine reference body\n",
        ),
      ],
      { rootDir: root, consent: true },
    );

    expect(report).toMatchObject({ deletedCount: 3, strippedCount: 0, skippedCount: 0 });
    expect(await snapshot(root)).toEqual({});
  });

  // The container half of the same claim: a projected skill's `references/*.md`
  // carry no prefix of their own, so the marker has to be read off the
  // `st-verify/` directory the engine minted under `skills/`.
  it("deletes a skill reference nested below an invocable-prefixed directory", async () => {
    const temp = tempDir();
    const root = temp.path("repo");
    await temp.seedFiles({
      "repo/.agents/skills/st-verify/references/ui.md": "# UI\n\nengine reference body\n",
    });

    // TEST CHANGE, justified: REQ-PLUGIN-045 — the block-less reference
    // records the hash of its bytes; the name proof needs one beside it.
    const report = await sweepReclaimCandidates(
      [recorded(candidate(".agents/skills/st-verify/references/ui.md"), "# UI\n\nengine reference body\n")],
      { rootDir: root, consent: true },
    );

    expect(onlyEntry(report).action).toBe("deleted");
    expect(await snapshot(root)).toEqual({});
  });

  it("still refuses a nested file when no ancestor carries the marker", async () => {
    const temp = tempDir();
    const root = temp.path("repo");
    await temp.seedFiles({ "repo/.agents/skills/my-skill/references/ui.md": "mine\n" });

    const report = await sweepReclaimCandidates(
      [candidate(".agents/skills/my-skill/references/ui.md")],
      { rootDir: root, consent: true },
    );

    expect(onlyEntry(report).action).toBe("skipped-unsafe-path");
    expect(await readFile(join(root, ".agents/skills/my-skill/references/ui.md"), "utf-8")).toBe(
      "mine\n",
    );
  });
});

describe("sweepReclaimCandidates — edge cases", () => {
  it("reports an already-deleted candidate as missing, not as an error", async () => {
    const temp = tempDir();
    const root = temp.path("repo");
    await temp.seedFiles({ "repo/.cursor/rules/50-stamity-kept.mdc": managedWhole("kept") });

    const report = await sweepReclaimCandidates(
      [
        // Parent still present, file gone.
        candidate(".cursor/rules/50-stamity-gone.mdc"),
        // Whole parent tree gone.
        // TEST CHANGE, justified: REQ-PLUGIN-045 — `.windsurf/rules/` is no
        // folder a release writes, so it now stops at gate 1; the absent tree
        // is a content folder the engine does write.
        candidate(".github/instructions/stamity-gone.instructions.md"),
      ],
      { rootDir: root, consent: true },
    );

    expect(report.entries.map((entry) => entry.action)).toEqual([
      "skipped-missing",
      "skipped-missing",
    ]);
    expect(report.skippedCount).toBe(2);
  });

  it("refuses a directory recorded where a file should be, without removing its contents", async () => {
    const temp = tempDir();
    const root = temp.path("repo");
    await temp.seedFiles({
      "repo/.claude/agents/stamity-implementer.md/inner.md": "user file inside\n",
    });

    const report = await sweepReclaimCandidates([candidate(".claude/agents/stamity-implementer.md")], {
      rootDir: root,
      consent: true,
    });

    const entry = onlyEntry(report);
    expect(entry.action).toBe("skipped-unsafe-path");
    expect(entry.detail).toContain("never removes a tree");
    expect(
      await readFile(join(root, ".claude/agents/stamity-implementer.md/inner.md"), "utf-8"),
    ).toBe("user file inside\n");
  });

  it("leaves a trusted shared file with no managed block entirely alone", async () => {
    const temp = tempDir();
    const root = temp.path("repo");
    const mcp = '{\n  "mcpServers": {\n    "mine": { "command": "node" }\n  }\n}\n';
    await temp.seedFiles({ "repo/.mcp.json": mcp });

    const report = await sweepReclaimCandidates([candidate(".mcp.json", "adapter-removed")], {
      rootDir: root,
      consent: true,
      trustedExactPaths: new Set([".mcp.json"]),
    });

    const entry = onlyEntry(report);
    expect(entry.action).toBe("skipped-user-content");
    expect(entry.detail).toContain("co-owned");
    expect(report).toMatchObject({ deletedCount: 0, strippedCount: 0, skippedCount: 1 });
    expect(await readFile(join(root, ".mcp.json"), "utf-8")).toBe(mcp);
  });

  it("still reclaims a trusted path whose managed block spans the whole file", async () => {
    const temp = tempDir();
    const root = temp.path("repo");
    await temp.seedFiles({ "repo/CLAUDE.md": managedWhole("engine instructions") });

    const report = await sweepReclaimCandidates([candidate("CLAUDE.md", "adapter-removed", "claude")], {
      rootDir: root,
      consent: true,
      trustedExactPaths: new Set(["CLAUDE.md"]),
    });

    // The allowlist waives only the name gate; sole ownership is still proven by
    // the block spanning every byte, which is what licenses the unlink.
    expect(onlyEntry(report).action).toBe("deleted");
    expect(await snapshot(root)).toEqual({});
  });

  it("strips rather than deletes a trusted path carrying user prose", async () => {
    const temp = tempDir();
    const root = temp.path("repo");
    const userTail = "## My house rules\n\nalways run the linter\n";
    await temp.seedFiles({ "repo/CLAUDE.md": `${managedWhole("engine instructions")}${userTail}` });

    const report = await sweepReclaimCandidates([candidate("CLAUDE.md", "adapter-removed", "claude")], {
      rootDir: root,
      consent: true,
      trustedExactPaths: new Set(["CLAUDE.md"]),
    });

    expect(onlyEntry(report).action).toBe("managed-block-stripped");
    expect(await readFile(join(root, "CLAUDE.md"), "utf-8")).toBe(`\n${userTail}`);
  });

  it("collapses several rows naming one path into a single action naming every reason", async () => {
    const temp = tempDir();
    const root = temp.path("repo");
    await temp.seedFiles({ "repo/AGENTS.md": managedWhole("shared engine body") });

    const report = await sweepReclaimCandidates(
      [
        candidate("AGENTS.md", "deselected", "cursor"),
        candidate("AGENTS.md", "adapter-removed", "claude"),
        // A `./`-spelled duplicate is the same file and must not double-act.
        candidate("./AGENTS.md", "deselected", "cursor"),
      ],
      { rootDir: root, consent: true, trustedExactPaths: new Set(["AGENTS.md"]) },
    );

    const entry = onlyEntry(report);
    expect(entry.path).toBe("AGENTS.md");
    // `adapter-removed` outranks `deselected`, and both rows are named in detail.
    expect(entry.candidateReason).toBe("adapter-removed");
    expect(entry.detail).toContain("deselected (cursor)");
    expect(entry.detail).toContain("adapter-removed (claude)");
    expect(report.deletedCount).toBe(1);
    expect(await snapshot(root)).toEqual({});
  });

  it("stamps the injected sweep time into every mutating entry", async () => {
    const temp = tempDir();
    const root = temp.path("repo");
    await temp.seedFiles({
      "repo/.cursor/rules/50-stamity-testing.mdc": managedWhole("engine rule"),
      "repo/.claude/agents/stamity-reviewer.md": `mine\n${managedWhole("engine body")}`,
    });
    const now = new Date("2031-04-05T06:07:08.900Z");

    const report = await sweepReclaimCandidates(
      [
        candidate(".cursor/rules/50-stamity-testing.mdc"),
        candidate(".claude/agents/stamity-reviewer.md"),
      ],
      { rootDir: root, consent: true, now },
    );

    expect(report.entries[0]?.detail).toContain("Deleted at 2031-04-05T06:07:08.900Z");
    expect(report.entries[1]?.detail).toContain("Stripped at 2031-04-05T06:07:08.900Z");
  });

  it("returns an empty report for no candidates without resolving the root", async () => {
    const report = await sweepReclaimCandidates([], {
      rootDir: join(tempDir().dir, "never-created"),
      consent: true,
    });

    // `consent` added to the expectation, not relaxed out of it: the report now
    // carries the mode it ran under so the formatter reads it instead of
    // guessing from the entries, and the early return has to carry it too.
    expect(report).toEqual({
      entries: [],
      consent: true,
      deletedCount: 0,
      strippedCount: 0,
      skippedCount: 0,
    });
  });

  it("throws a validation error when the root itself cannot be resolved", async () => {
    const missing = join(tempDir().dir, "never-created");

    await expect(
      sweepReclaimCandidates([candidate(".cursor/rules/stamity-x.mdc")], {
        rootDir: missing,
        consent: true,
      }),
    ).rejects.toMatchObject({ constructor: EngineError, code: "VALIDATION_ERROR" });
  });
});

describe("sweepReclaimCandidates — recorded-hash ownership", () => {
  it("deletes an unprefixed state-dir file whose bytes match the recorded hash", async () => {
    const temp = tempDir();
    const root = temp.path("repo");
    await temp.seedFiles({ [`repo/${PACK_FILE}`]: PACK_BODY });

    const report = await sweepReclaimCandidates([hashedCandidate(PACK_FILE, PACK_BODY)], {
      rootDir: root,
      consent: true,
    });

    const entry = onlyEntry(report);
    expect(entry.action).toBe("deleted");
    expect(entry.detail).toContain("still hash to what the ledger recorded");
    expect(await snapshot(root)).toEqual({ ".stamity/": "" });
  });

  it("keeps a state-dir file whose bytes drifted from the recorded hash", async () => {
    const temp = tempDir();
    const root = temp.path("repo");
    await temp.seedFiles({ [`repo/${PACK_FILE}`]: "edited by hand\n" });

    const report = await sweepReclaimCandidates([hashedCandidate(PACK_FILE, PACK_BODY)], {
      rootDir: root,
      consent: true,
    });

    const entry = onlyEntry(report);
    expect(entry.action).toBe("skipped-user-content");
    expect(entry.detail).toContain("edited since");
    expect(await readFile(join(root, PACK_FILE), "utf-8")).toBe("edited by hand\n");
  });

  // A CRLF checkout of the file the engine wrote. Producers hash the LF string
  // they emit, so the ledger holds an LF hash; `core.autocrlf=true` — the Git
  // for Windows installer default — hands the reader the same committed bytes
  // back as CRLF. Without the fold the raw compare misses, the hash veto fires
  // on a file nobody edited, and the sweep skips it on every run.
  it("deletes a CRLF checkout of bytes whose recorded hash was taken over LF", async () => {
    const temp = tempDir();
    const root = temp.path("repo");
    const crlf = PACK_BODY.replaceAll("\n", "\r\n");
    await temp.seedFiles({ [`repo/${PACK_FILE}`]: crlf });

    const report = await sweepReclaimCandidates([hashedCandidate(PACK_FILE, PACK_BODY)], {
      rootDir: root,
      consent: true,
    });

    const entry = onlyEntry(report);
    expect(entry.action).toBe("deleted");
    expect(entry.detail).toContain("still hash to what the ledger recorded");
    expect(await snapshot(root)).toEqual({ ".stamity/": "" });
  });

  // The other half of the same rule: the fold admits a line-ending translation
  // and nothing else, so a hand edit that also arrived CRLF still misses both
  // comparisons and still keeps its bytes.
  it("keeps a CRLF file whose folded bytes still disagree with the recorded hash", async () => {
    const temp = tempDir();
    const root = temp.path("repo");
    const edited = `${PACK_BODY}Edited by hand.\n`.replaceAll("\n", "\r\n");
    await temp.seedFiles({ [`repo/${PACK_FILE}`]: edited });

    const report = await sweepReclaimCandidates([hashedCandidate(PACK_FILE, PACK_BODY)], {
      rootDir: root,
      consent: true,
    });

    const entry = onlyEntry(report);
    expect(entry.action).toBe("skipped-user-content");
    expect(entry.detail).toContain("edited since");
    expect(await readFile(join(root, PACK_FILE), "utf-8")).toBe(edited);
  });

  // Renamed from "refuses a matching hash outside the state dir, where a row may
  // describe a merged block". Justification: every assertion is preserved
  // verbatim — this is a re-titling, not a relaxation. The old title stated a
  // rule wider than the one the sweep enforces, and a rationale that does not
  // hold: a recorded hash always covers the FULL emitted content, never the
  // managed block alone, so it cannot describe a merged file. What actually
  // refuses this candidate is that the caller vouched for nothing — no
  // allowlist entry — which is the invariant worth pinning here.
  it("refuses a matching hash outside the state dir when the caller trusts no path", async () => {
    const temp = tempDir();
    const root = temp.path("repo");
    await temp.seedFiles({ "repo/AGENTS.md": PACK_BODY });

    const report = await sweepReclaimCandidates([hashedCandidate("AGENTS.md", PACK_BODY)], {
      rootDir: root,
      consent: true,
    });

    const entry = onlyEntry(report);
    expect(entry.action).toBe("skipped-unsafe-path");
    expect(entry.detail).toContain("ownership marker");
    expect(await readFile(join(root, "AGENTS.md"), "utf-8")).toBe(PACK_BODY);
  });

  // The uninstall path for block-less whole-file infra the engine emits at
  // platform-mandated names: `AGENTS.md`, `.claude/settings.json`, the plugin
  // container. The allowlist waives the NAME gate; before the hash was admitted
  // here these files could prove sole ownership no other way, so `clean`
  // reported success while leaving every one of them on disk.
  it("deletes a trusted path whose bytes match the recorded hash", async () => {
    const temp = tempDir();
    const root = temp.path("repo");
    // TEST CHANGE, justified: REQ-PLUGIN-046 — at `AGENTS.md` a matching hash
    // deletes only bytes that show the engine wrote them, so the fixture holds
    // a charter rather than a pack agent's body; the subject (a trusted hash
    // match is the uninstall licence) is unchanged.
    await temp.seedFiles({ "repo/AGENTS.md": CHARTER_BODY });

    const report = await sweepReclaimCandidates([hashedCandidate("AGENTS.md", CHARTER_BODY)], {
      rootDir: root,
      consent: true,
      trustedExactPaths: new Set(["AGENTS.md"]),
    });

    const entry = onlyEntry(report);
    expect(entry.action).toBe("deleted");
    expect(entry.detail).toContain("still hash to what the ledger recorded");
    expect(await snapshot(root)).toEqual({});
  });

  // The safety half of the same rule, and the reason admitting the hash does not
  // widen deletion: an exact match is what licenses the unlink, so a user edit
  // to one of those platform-named files withdraws the licence.
  it("keeps a trusted path whose bytes drifted from the recorded hash", async () => {
    const temp = tempDir();
    const root = temp.path("repo");
    const edited = `${PACK_BODY}\n## My house rules\n`;
    await temp.seedFiles({ "repo/AGENTS.md": edited });

    const report = await sweepReclaimCandidates([hashedCandidate("AGENTS.md", PACK_BODY)], {
      rootDir: root,
      consent: true,
      trustedExactPaths: new Set(["AGENTS.md"]),
    });

    const entry = onlyEntry(report);
    expect(entry.action).toBe("skipped-user-content");
    expect(entry.detail).toContain("edited since");
    expect(await readFile(join(root, "AGENTS.md"), "utf-8")).toBe(edited);
  });

  // The name/hash disagreement, and the direction the sweep used to resolve
  // wrongly. `isHashProvable` asks whether a MATCH may stand in for an
  // ownership marker, which is a question about where the file sits. A
  // MISMATCH is a fact about the bytes, so it is admissible wherever the hash
  // was recorded — and it outranks a name, which only ever says the engine
  // would have picked that spelling.
  const EDITED_RULE = "repo/.cursor/rules/50-stamity-testing.mdc";
  const EMITTED_RULE_BODY = "engine rule body\n";

  it("refuses to delete an engine-named file whose bytes drifted from the recorded hash", async () => {
    const temp = tempDir();
    const root = temp.path("repo");
    await temp.seedFiles({ [EDITED_RULE]: "my own rule body\n" });

    const report = await sweepReclaimCandidates(
      [hashedCandidate(".cursor/rules/50-stamity-testing.mdc", EMITTED_RULE_BODY)],
      { rootDir: root, consent: true },
    );

    const entry = onlyEntry(report);
    expect(report.deletedCount).toBe(0);
    expect(entry.action).toBe("skipped-user-content");
    expect(entry.detail).toContain("edited since");
    // The old detail asserted the opposite of what the ledger row proved — that
    // nothing in the file could be user-authored — while unlinking it with no
    // `.bak` to recover from.
    expect(entry.detail).not.toContain("no managed block whose surroundings could be user-authored");
    expect(await readFile(join(root, ".cursor/rules/50-stamity-testing.mdc"), "utf-8")).toBe(
      "my own rule body\n",
    );
  });

  it("still deletes the same engine-named file while its bytes match", async () => {
    const temp = tempDir();
    const root = temp.path("repo");
    await temp.seedFiles({ [EDITED_RULE]: EMITTED_RULE_BODY });

    const report = await sweepReclaimCandidates(
      [hashedCandidate(".cursor/rules/50-stamity-testing.mdc", EMITTED_RULE_BODY)],
      { rootDir: root, consent: true },
    );

    expect(onlyEntry(report).action).toBe("deleted");
    expect(await snapshot(root)).toEqual({});
  });

  it("vetoes deletion of a whole-file managed block whose bytes drifted too", async () => {
    const temp = tempDir();
    const root = temp.path("repo");
    // A block spanning the file normally proves the file is engine output. A
    // recorded hash that disagrees outranks it: something rewrote the body, and
    // regenerating it is the sync's job — the sweep would only delete the edit.
    const emitted = managedWhole("engine body");
    await temp.seedFiles({ [EDITED_RULE]: managedWhole("hand-edited body") });

    const report = await sweepReclaimCandidates(
      [hashedCandidate(".cursor/rules/50-stamity-testing.mdc", emitted)],
      { rootDir: root, consent: true },
    );

    const entry = onlyEntry(report);
    expect(report.deletedCount).toBe(0);
    expect(entry.action).toBe("skipped-user-content");
    expect(await readFile(join(root, ".cursor/rules/50-stamity-testing.mdc"), "utf-8")).toBe(
      managedWhole("hand-edited body"),
    );
  });

  it("keeps the veto under a dry run, with nothing deleted and nothing previewed as deleted", async () => {
    const temp = tempDir();
    const root = temp.path("repo");
    await temp.seedFiles({ [EDITED_RULE]: "my own rule body\n" });
    const before = await snapshot(root);

    const report = await sweepReclaimCandidates(
      [hashedCandidate(".cursor/rules/50-stamity-testing.mdc", EMITTED_RULE_BODY)],
      { rootDir: root, consent: false },
    );

    expect(report).toMatchObject({ deletedCount: 0, strippedCount: 0 });
    const entry = onlyEntry(report);
    // A candidate a gate refused reports the refusal, never a consent preview —
    // consent cannot unlock what the bytes themselves vetoed.
    expect(entry.action).toBe("skipped-user-content");
    expect(entry.detail).not.toContain("Consent would delete");
    expect(await snapshot(root)).toEqual(before);
  });

  it("still refuses a state-dir row that recorded no hash at all", async () => {
    const temp = tempDir();
    const root = temp.path("repo");
    await temp.seedFiles({ [`repo/${PACK_FILE}`]: PACK_BODY });
    // TEST CHANGE, justified: REQ-PLUGIN-045 — the row is the pack's own (a
    // tool row in a pack folder now stops at gate 1 for another reason), with
    // its hash removed, so the refusal is still the missing hash at gate 2.
    const { contentHash: _dropped, ...hashless } = hashedCandidate(PACK_FILE, PACK_BODY).entry;

    const report = await sweepReclaimCandidates([{ entry: hashless, reason: "deselected" }], {
      rootDir: root,
      consent: true,
    });

    expect(onlyEntry(report).action).toBe("skipped-unsafe-path");
    expect(onlyEntry(report).detail).toContain("ownership marker");
    expect(await readFile(join(root, PACK_FILE), "utf-8")).toBe(PACK_BODY);
  });
});

/**
 * REQ-PLUGIN-045: inside the bound, a row proves a delete only with the bytes.
 * A hashless row whose path carried an engine name used to be deleted on the
 * name alone, and a hash proved a delete anywhere under `.stamity/`; every
 * release records a hash on every row, so a row without one is a hand edit.
 */
describe("sweepReclaimCandidates — the bytes, not the row, prove a delete", () => {
  const GONE = ".claude/agents/stamity-gone.md";
  const GONE_BYTES = "a block-less engine agent\n";

  it("keeps an engine-named block-less file whose row records no hash", async () => {
    const temp = tempDir();
    const root = temp.path("repo");
    await temp.seedFiles({ [`repo/${GONE}`]: GONE_BYTES });

    const report = await sweepReclaimCandidates([candidate(GONE, "deselected", "claude")], {
      rootDir: root,
      consent: true,
    });

    const entry = onlyEntry(report);
    expect(entry.action).toBe("skipped-unsafe-path");
    expect(entry.detail).toContain("records no content hash");
    expect(entry).not.toHaveProperty("proof");
    expect(await readFile(join(root, GONE), "utf-8")).toBe(GONE_BYTES);
  });

  it("deletes the same file once its row records the hash of its bytes, naming the proof", async () => {
    const temp = tempDir();
    const root = temp.path("repo");
    await temp.seedFiles({ [`repo/${GONE}`]: GONE_BYTES });

    const report = await sweepReclaimCandidates([recorded(candidate(GONE, "deselected", "claude"), GONE_BYTES)], {
      rootDir: root,
      consent: true,
    });

    expect(onlyEntry(report)).toMatchObject({ action: "deleted", proof: "hash" });
    expect(await snapshot(root)).toEqual({});
  });

  it("does not let a matching hash alone delete an unprefixed file in a content folder", async () => {
    // An override-added skill is emitted unprefixed and owners keep their own
    // files in these folders, so a hash is never enough there without the name.
    const temp = tempDir();
    const root = temp.path("repo");
    const mine = ".agents/skills/my-skill/SKILL.md";
    await temp.seedFiles({ [`repo/${mine}`]: "my skill\n" });

    const report = await sweepReclaimCandidates([recorded(candidate(mine), "my skill\n")], {
      rootDir: root,
      consent: true,
    });

    expect(onlyEntry(report).action).toBe("skipped-unsafe-path");
    expect(await readFile(join(root, mine), "utf-8")).toBe("my skill\n");
  });

  it("previews the delete of a hashed file in a state folder the engine writes, naming the proof", async () => {
    const temp = tempDir();
    const root = temp.path("repo");
    const policy = ".stamity/generated/agent-tool-policies.json";
    await temp.seedFiles({ [`repo/${policy}`]: "{}\n" });

    const report = await sweepReclaimCandidates([recorded(candidate(policy, "adapter-removed", "claude"), "{}\n")], {
      rootDir: root,
      consent: false,
    });

    expect(onlyEntry(report)).toMatchObject({ action: "dry-run", wouldBe: "deleted", proof: "hash" });
  });

  it("deletes a trusted per-package charter whose bytes match, and keeps an untrusted one", async () => {
    const temp = tempDir();
    const root = temp.path("repo");
    const charter = "packages/app/AGENTS.md";
    // TEST CHANGE, justified: REQ-PLUGIN-046 — a charter is deleted whole only
    // when its bytes carry the charter's four headings; `# Charter` followed by
    // a line of text is exactly the shape the recogniser refuses.
    const body = CHARTER_BODY;
    await temp.seedFiles({ [`repo/${charter}`]: body });
    const row = recorded(candidate(charter, "deselected", "codex"), body);

    const untrusted = await sweepReclaimCandidates([row], { rootDir: root, consent: true });
    expect(onlyEntry(untrusted).action).toBe("skipped-unsafe-path");

    const trusted = await sweepReclaimCandidates([row], {
      rootDir: root,
      consent: true,
      trustedExactPaths: new Set([charter]),
    });
    expect(onlyEntry(trusted)).toMatchObject({ action: "deleted", proof: "hash" });
  });

  it("names the block as the proof of a delete and of a strip", async () => {
    const temp = tempDir();
    const root = temp.path("repo");
    await temp.seedFiles({
      "repo/.cursor/rules/50-stamity-testing.mdc": managedWhole("engine rule"),
      "repo/.claude/agents/stamity-reviewer.md": `mine\n${managedWhole("engine body")}`,
    });

    const report = await sweepReclaimCandidates(
      [candidate(".cursor/rules/50-stamity-testing.mdc"), candidate(".claude/agents/stamity-reviewer.md")],
      { rootDir: root, consent: true },
    );

    expect(report.entries.map((entry) => [entry.action, entry.proof])).toEqual([
      ["deleted", "block"],
      ["managed-block-stripped", "block"],
    ]);
  });
});

/**
 * The co-owned lane, tested against a HAND-WRITTEN reducer rather than the MCP
 * one. The sweep's contract here is "hand the bytes to the reducer, then act on
 * its verdict under the same gates as every other path" — asserting that through
 * `mcp/emit.ts` would make these cases fail whenever an unrelated catalog entry
 * changed, and would leave the sweep's own branch unproven when it did not. The
 * MCP reducer's own judgement is proved in `test/manifest/mcpFilter.test.ts`, and
 * the two meeting in a shipped verb in `test/cli/commands/syncMcpOwnership.test.ts`.
 */
describe("sweepReclaimCandidates — an instruction file leaves only on its own bytes", () => {
  // REQ-PLUGIN-046: at `AGENTS.md` in any folder, `AGENTS.override.md`,
  // `CLAUDE.md` and the Copilot setup workflow, a matching recorded hash is not
  // enough on its own — an owner's file sits at the very name the engine
  // writes, and a hand-added row can hash the owner's bytes.
  const OWNER = "# Team notes\n\nOur own agent instructions.\n";

  it("keeps an owner's AGENTS.md that a trusted row hashes, and names why", async () => {
    const temp = tempDir();
    const root = temp.path("repo");
    await temp.seedFiles({ "repo/AGENTS.md": OWNER });

    const report = await sweepReclaimCandidates([hashedCandidate("AGENTS.md", OWNER)], {
      rootDir: root,
      consent: true,
      trustedExactPaths: new Set(["AGENTS.md"]),
    });

    const entry = onlyEntry(report);
    expect(entry.action).toBe("skipped-user-content");
    expect(entry.detail).toContain("only when its own bytes show the engine wrote it");
    expect(entry).not.toHaveProperty("proof");
    expect(await readFile(join(root, "AGENTS.md"), "utf-8")).toBe(OWNER);
  });

  it("still deletes an instruction file a managed block spans, naming the block", async () => {
    const temp = tempDir();
    const root = temp.path("repo");
    const spanning = wrapInManagedBlock("an earlier engine charter", "CLAUDE.md");
    await temp.seedFiles({ "repo/CLAUDE.md": spanning });

    const report = await sweepReclaimCandidates([hashedCandidate("CLAUDE.md", spanning)], {
      rootDir: root,
      consent: true,
      trustedExactPaths: new Set(["CLAUDE.md"]),
    });

    expect(onlyEntry(report)).toMatchObject({ action: "deleted", proof: "block" });
    expect(await snapshot(root)).toEqual({});
  });

  it("strips only the block from a supplemented AGENTS.md a trusted row hashes", async () => {
    const temp = tempDir();
    const root = temp.path("repo");
    const supplemented = `${wrapInManagedBlock("engine charter", "AGENTS.md")}${OWNER}`;
    await temp.seedFiles({ "repo/AGENTS.md": supplemented });

    const report = await sweepReclaimCandidates([hashedCandidate("AGENTS.md", supplemented)], {
      rootDir: root,
      consent: true,
      trustedExactPaths: new Set(["AGENTS.md"]),
    });

    expect(onlyEntry(report)).toMatchObject({ action: "managed-block-stripped", proof: "block" });
    // Every byte outside the block is kept verbatim, the newline after the END marker included.
    expect(await readFile(join(root, "AGENTS.md"), "utf-8")).toBe(`\n${OWNER}`);
  });

  it("deletes the engine's Copilot workflow and a folder's Codex appendix on their own bytes", async () => {
    const temp = tempDir();
    const root = temp.path("repo");
    const workflow = ".github/workflows/copilot-setup-steps.yml";
    const workflowBytes =
      "name: Copilot Setup Steps\n\n# Prepares the environment the GitHub Copilot coding agent works in. The agent runs\n";
    const appendix = "packages/app/AGENTS.md";
    const appendixBytes = "# Conditional rules (Codex down-conversion) — `packages/app`\n\nRules.\n";
    await temp.seedFiles({ [`repo/${workflow}`]: workflowBytes, [`repo/${appendix}`]: appendixBytes });

    const report = await sweepReclaimCandidates(
      [hashedCandidate(workflow, workflowBytes), hashedCandidate(appendix, appendixBytes)],
      { rootDir: root, consent: true, trustedExactPaths: new Set([workflow, appendix]) },
    );

    expect(report.entries.map((entry) => [entry.path, entry.action, entry.proof])).toEqual([
      [workflow, "deleted", "hash"],
      [appendix, "deleted", "hash"],
    ]);
  });
});

describe("sweepReclaimCandidates — co-owned documents", () => {
  const CO_OWNED = ".mcp.json";
  const ENGINE_LINE = "ENGINE-OWNED\n";

  /** Removes the engine's marker line; the rest of the file is the operator's. */
  const reducerFor = (path = CO_OWNED): Map<string, CoOwnedReducer> =>
    new Map([
      [
        path,
        (content: string): CoOwnedReduction => {
          if (!content.includes(ENGINE_LINE)) {
            return { kind: "untouched", detail: "Nothing here is the engine's." };
          }
          const left = content.split(ENGINE_LINE).join("");
          return left.trim() === ""
            ? { kind: "engine-only", detail: "Every byte was the engine's." }
            : { kind: "reduced", content: left, detail: "Engine lines removed." };
        },
      ],
    ]);

  /** A trusted row carrying the hash of the bytes on disk — the regression's shape. */
  function coOwnedCandidate(content: string): ReclaimCandidate {
    return {
      entry: {
        path: CO_OWNED,
        adapter: "claude",
        artifactId: "mcp",
        artifactType: "infra",
        contentHash: createHash("sha256").update(Buffer.from(content, "utf8")).digest("hex"),
      },
      reason: "deselected",
    };
  }

  // The regression this lane exists for. Both writers record the hash of the
  // MERGED bytes, so a co-owned document that nobody has touched since the last
  // sync matches its recorded hash exactly — and before the reducer existed the
  // sweep read that match as sole authorship and unlinked the file, taking a
  // hand-added MCP server with it, with no backup and no entry naming the loss.
  it("reduces rather than deletes a hash-matched document holding user content", async () => {
    const temp = tempDir();
    const root = temp.path("repo");
    const merged = `${ENGINE_LINE}operator server\n`;
    await temp.seedFiles({ [`repo/${CO_OWNED}`]: merged });

    const report = await sweepReclaimCandidates([coOwnedCandidate(merged)], {
      rootDir: root,
      consent: true,
      trustedExactPaths: new Set([CO_OWNED]),
      coOwnedPaths: reducerFor(),
    });

    const entry = onlyEntry(report);
    expect(entry.action).toBe("co-owned-reduced");
    expect(entry.detail).toContain("Engine lines removed.");
    expect(await readFile(join(root, CO_OWNED), "utf-8")).toBe("operator server\n");
    expect(report).toMatchObject({ deletedCount: 0, strippedCount: 1, skippedCount: 0 });
  });

  it("still deletes a co-owned path once the reducer finds nothing of the user's left", async () => {
    const temp = tempDir();
    const root = temp.path("repo");
    await temp.seedFiles({ [`repo/${CO_OWNED}`]: ENGINE_LINE });

    const report = await sweepReclaimCandidates([coOwnedCandidate(ENGINE_LINE)], {
      rootDir: root,
      consent: true,
      trustedExactPaths: new Set([CO_OWNED]),
      coOwnedPaths: reducerFor(),
    });

    // The uninstall the reduction must not cost: a husk still goes, so the fix
    // trades no reclaim coverage for the safety it adds.
    expect(onlyEntry(report).action).toBe("deleted");
    expect(await snapshot(root)).toEqual({});
  });

  it("leaves a co-owned path the reducer claims nothing in", async () => {
    const temp = tempDir();
    const root = temp.path("repo");
    const theirs = "operator server\n";
    await temp.seedFiles({ [`repo/${CO_OWNED}`]: theirs });

    const report = await sweepReclaimCandidates([coOwnedCandidate(theirs)], {
      rootDir: root,
      consent: true,
      trustedExactPaths: new Set([CO_OWNED]),
      coOwnedPaths: reducerFor(),
    });

    expect(onlyEntry(report).action).toBe("skipped-user-content");
    expect(await readFile(join(root, CO_OWNED), "utf-8")).toBe(theirs);
  });

  // S-W3: the co-owned lane settles ahead of the hash veto, so a document whose
  // bytes no longer match what the ledger recorded — an operator's row inside
  // the engine's own key, which the reducer cannot see — was rewritten or
  // unlinked with no backup, the one lane in the engine that did. The write
  // lanes' rule applies here too: touched behind a verified .bak when drifted.
  it("backs a drifted co-owned document up before reducing it, and names the .bak", async () => {
    const temp = tempDir();
    const root = temp.path("repo");
    const merged = `${ENGINE_LINE}operator server\n`;
    await temp.seedFiles({ [`repo/${CO_OWNED}`]: merged });

    // The row records other bytes: the file changed since the engine wrote it.
    const report = await sweepReclaimCandidates([coOwnedCandidate(ENGINE_LINE)], {
      rootDir: root,
      consent: true,
      trustedExactPaths: new Set([CO_OWNED]),
      coOwnedPaths: reducerFor(),
    });

    const entry = onlyEntry(report);
    expect(entry.action).toBe("co-owned-reduced");
    expect(entry.detail).toContain(`${CO_OWNED}.bak`);
    expect(await readFile(join(root, `${CO_OWNED}.bak`), "utf-8")).toBe(merged);
    expect(await readFile(join(root, CO_OWNED), "utf-8")).toBe("operator server\n");
  });

  it("backs a drifted co-owned document up before deleting it, and says the engine's keys may carry rows of the operator's", async () => {
    const temp = tempDir();
    const root = temp.path("repo");
    await temp.seedFiles({ [`repo/${CO_OWNED}`]: ENGINE_LINE });

    const report = await sweepReclaimCandidates([coOwnedCandidate("what the engine wrote\n")], {
      rootDir: root,
      consent: true,
      trustedExactPaths: new Set([CO_OWNED]),
      coOwnedPaths: reducerFor(),
    });

    const entry = onlyEntry(report);
    expect(entry.action).toBe("deleted");
    expect(entry.detail).toContain("rows of yours");
    expect(entry.detail).toContain(`${CO_OWNED}.bak`);
    expect(await snapshot(root)).toEqual({ [`${CO_OWNED}.bak`]: ENGINE_LINE });
  });

  // REQ-PLUGIN-045: a row with no hash proves nothing, on this lane too. The
  // reducer removes keys by name, so a hand-added hashless row reads as drift
  // and the reduction lands behind a verified .bak.
  it("backs a co-owned document up when its row records no hash, and says so", async () => {
    const temp = tempDir();
    const root = temp.path("repo");
    const merged = `${ENGINE_LINE}operator server\n`;
    await temp.seedFiles({ [`repo/${CO_OWNED}`]: merged });
    const { contentHash: _dropped, ...hashless } = coOwnedCandidate(merged).entry;

    const report = await sweepReclaimCandidates([{ entry: hashless, reason: "deselected" }], {
      rootDir: root,
      consent: true,
      trustedExactPaths: new Set([CO_OWNED]),
      coOwnedPaths: reducerFor(),
    });

    const entry = onlyEntry(report);
    expect(entry.action).toBe("co-owned-reduced");
    expect(entry.detail).toContain("records no content hash");
    expect(entry.detail).toContain(`${CO_OWNED}.bak`);
    expect(await readFile(join(root, `${CO_OWNED}.bak`), "utf-8")).toBe(merged);
    expect(await readFile(join(root, CO_OWNED), "utf-8")).toBe("operator server\n");
  });

  it("takes no backup of a co-owned document whose bytes still match the recorded hash", async () => {
    const temp = tempDir();
    const root = temp.path("repo");
    await temp.seedFiles({ [`repo/${CO_OWNED}`]: ENGINE_LINE });

    const report = await sweepReclaimCandidates([coOwnedCandidate(ENGINE_LINE)], {
      rootDir: root,
      consent: true,
      trustedExactPaths: new Set([CO_OWNED]),
      coOwnedPaths: reducerFor(),
    });

    expect(onlyEntry(report).action).toBe("deleted");
    expect(onlyEntry(report).detail).not.toContain(".bak");
    expect(await snapshot(root)).toEqual({});
  });

  it("previews the backup under a dry run and writes nothing", async () => {
    const temp = tempDir();
    const root = temp.path("repo");
    const merged = `${ENGINE_LINE}operator server\n`;
    await temp.seedFiles({ [`repo/${CO_OWNED}`]: merged });

    const report = await sweepReclaimCandidates([coOwnedCandidate(ENGINE_LINE)], {
      rootDir: root,
      consent: false,
      trustedExactPaths: new Set([CO_OWNED]),
      coOwnedPaths: reducerFor(),
    });

    expect(onlyEntry(report).action).toBe("dry-run");
    expect(onlyEntry(report).detail).toContain("backed up first");
    expect(await snapshot(root)).toEqual({ [CO_OWNED]: merged });
  });

  it.skipIf(process.platform === "win32")("refuses to delete a drifted document it cannot back up — a hard link — and leaves it in place", async () => {
    const temp = tempDir();
    const root = temp.path("repo");
    await temp.seedFiles({ [`repo/${CO_OWNED}`]: ENGINE_LINE, "twin.json": "" });
    await rm(temp.path("twin.json"));
    await link(join(root, CO_OWNED), temp.path("twin.json"));

    const report = await sweepReclaimCandidates([coOwnedCandidate("what the engine wrote\n")], {
      rootDir: root,
      consent: true,
      trustedExactPaths: new Set([CO_OWNED]),
      coOwnedPaths: reducerFor(),
    });

    const entry = onlyEntry(report);
    expect(entry.action).toBe("skipped-unsafe-path");
    expect(entry.detail).toContain("could not be backed up");
    expect(await readFile(join(root, CO_OWNED), "utf-8")).toBe(ENGINE_LINE);
  });

  it("previews the reduction under a dry run and writes nothing", async () => {
    const temp = tempDir();
    const root = temp.path("repo");
    const merged = `${ENGINE_LINE}operator server\n`;
    await temp.seedFiles({ [`repo/${CO_OWNED}`]: merged });

    const report = await sweepReclaimCandidates([coOwnedCandidate(merged)], {
      rootDir: root,
      consent: false,
      trustedExactPaths: new Set([CO_OWNED]),
      coOwnedPaths: reducerFor(),
    });

    const entry = onlyEntry(report);
    expect(entry.action).toBe("dry-run");
    expect(entry.detail).toContain("remove the engine's own content from this path and keep the rest");
    expect(await readFile(join(root, CO_OWNED), "utf-8")).toBe(merged);
  });

  // Gate 4's hard-link refusal, in the co-owned lane. The managed-block strip
  // lane already refuses a shared name for this reason; the reduction reaches
  // the same temp+rename primitive down a different path, so it has to refuse
  // on the same tell or the guard is one branch wide instead of two.
  it.skipIf(process.platform === "win32")(
    "refuses to reduce a co-owned document that carries a second name",
    async () => {
      const temp = tempDir();
      const root = temp.path("repo");
      const merged = `${ENGINE_LINE}operator server\n`;
      // The twin sits OUTSIDE the repo, which is the shape the refusal is about:
      // a rename lands a fresh inode at the repo's name, so the operator's
      // entries would be republished INSIDE the tree while the outside name kept
      // the originals — a copy made, not a file edited.
      await temp.seedFiles({ "outside/twin.json": merged });
      await mkdir(root, { recursive: true });
      await link(temp.path("outside/twin.json"), join(root, CO_OWNED));

      const report = await sweepReclaimCandidates([coOwnedCandidate(merged)], {
        rootDir: root,
        consent: true,
        trustedExactPaths: new Set([CO_OWNED]),
        coOwnedPaths: reducerFor(),
      });

      const entry = onlyEntry(report);
      expect(entry.action).toBe("skipped-unsafe-path");
      expect(entry.detail).toContain("hard link");
      // "Nothing was touched" is the whole promise: both names still read as they did.
      expect(await readFile(join(root, CO_OWNED), "utf-8")).toBe(merged);
      expect(await readFile(temp.path("outside/twin.json"), "utf-8")).toBe(merged);
      expect(report).toMatchObject({ deletedCount: 0, strippedCount: 0, skippedCount: 1 });
    },
  );

  // A reduction that cannot land must say so in its OWN vocabulary. The strip
  // lane and the co-owned lane share one writer and one catch, so before this
  // case the operator could be told "the managed block could not be stripped"
  // about a document that has no managed block in it.
  it.skipIf(!CAN_TEST_PERMISSIONS)(
    "names the reduction, not a block strip, when the rewrite cannot land",
    async () => {
      const temp = tempDir();
      const root = temp.path("repo");
      const merged = `${ENGINE_LINE}operator server\n`;
      await temp.seedFiles({ [`repo/${CO_OWNED}`]: merged });
      // A read-only parent drives the writer's own failure deterministically:
      // temp+rename creates its temp file beside the target, and the lock is a
      // sibling too, so neither can be created here. The read above it still
      // works, so the sweep reaches the reduction before it fails.
      await chmod(root, 0o555);

      try {
        const report = await sweepReclaimCandidates([coOwnedCandidate(merged)], {
          rootDir: root,
          consent: true,
          trustedExactPaths: new Set([CO_OWNED]),
          coOwnedPaths: reducerFor(),
        });

        const entry = onlyEntry(report);
        expect(entry.action).toBe("skipped-unsafe-path");
        expect(entry.detail).toContain("The engine's own content could not be removed");
        expect(entry.detail).not.toContain("managed block");
        // A failed rewrite is not a partial one: the operator's entries survive intact.
        expect(await readFile(join(root, CO_OWNED), "utf-8")).toBe(merged);
        expect(report).toMatchObject({ deletedCount: 0, strippedCount: 0, skippedCount: 1 });
      } finally {
        await chmod(root, 0o755);
      }
    },
  );

  it("does not consult a reducer for a path that is not declared co-owned", async () => {
    const temp = tempDir();
    const root = temp.path("repo");
    // TEST CHANGE, justified: REQ-PLUGIN-046 — `AGENTS.md` is deleted on a hash
    // only when its bytes are a charter, so the fixture holds one; the subject
    // (an undeclared path never reaches a reducer) is unchanged.
    await temp.seedFiles({ "repo/AGENTS.md": CHARTER_BODY });

    // The blast-radius guard: declaring one path co-owned must not change how any
    // other trusted hash-proved path is judged, or the fix would have withdrawn
    // the block-less-infra uninstall it is not about.
    const report = await sweepReclaimCandidates([hashedCandidate("AGENTS.md", CHARTER_BODY)], {
      rootDir: root,
      consent: true,
      trustedExactPaths: new Set(["AGENTS.md"]),
      coOwnedPaths: reducerFor(CO_OWNED),
    });

    expect(onlyEntry(report).action).toBe("deleted");
  });

  it("names the reducer as the proof, on the preview and on the applied run", async () => {
    const temp = tempDir();
    const root = temp.path("repo");
    const merged = `${ENGINE_LINE}operator server\n`;
    await temp.seedFiles({ [`repo/${CO_OWNED}`]: merged });
    const opts = { rootDir: root, trustedExactPaths: new Set([CO_OWNED]), coOwnedPaths: reducerFor() };

    const preview = await sweepReclaimCandidates([coOwnedCandidate(merged)], { ...opts, consent: false });
    expect(onlyEntry(preview)).toMatchObject({ action: "dry-run", wouldBe: "co-owned-reduced", proof: "co-owned" });

    const applied = await sweepReclaimCandidates([coOwnedCandidate(merged)], { ...opts, consent: true });
    expect(onlyEntry(applied)).toMatchObject({ action: "co-owned-reduced", proof: "co-owned" });

    await temp.seedFiles({ [`repo/${CO_OWNED}`]: ENGINE_LINE });
    const deleted = await sweepReclaimCandidates([coOwnedCandidate(ENGINE_LINE)], { ...opts, consent: true });
    expect(onlyEntry(deleted)).toMatchObject({ action: "deleted", proof: "co-owned" });
  });
});

describe("sweepReclaimCandidates — the strip target removed before the write", () => {
  it("reports it missing instead of re-creating the file the operator deleted", async () => {
    const temp = tempDir();
    const root = temp.path("repo");
    const rel = ".claude/agents/stamity-reviewer.md";
    await temp.seedFiles({ [`repo/${rel}`]: `user prose\n${managedWhole("engine body")}` });
    const target = join(root, ".claude", "agents", "stamity-reviewer.md");

    // The operator deletes the file between the plan and the write. Both lanes
    // share the pin re-check, and it used to answer a not-found the same way for
    // both: "the pin holds". The unlink lane can live with that — it reports
    // what it finds. The strip lane cannot: it writes through the atomic writer,
    // whose whole-file write CREATES, so the deleted file came back minus its
    // block and the report called it `managed-block-stripped`.
    //
    // The removal is armed on the SECOND lstat of the target — the one inside
    // the re-check — and runs before delegating, so the re-check sees ENOENT.
    // A real operator hits the same window probabilistically.
    let lstats = 0;
    vi.resetModules();
    const patched = {
      ...realFsPromises,
      lstat: async (...args: Parameters<typeof realFsPromises.lstat>) => {
        if (args[0] === target && lstats++ === 1) {
          await realFsPromises.rm(target, { force: true });
        }
        return await realFsPromises.lstat(...args);
      },
    };
    vi.doMock("node:fs/promises", () => ({ ...patched, default: patched }));
    const mod: typeof ReclaimApi = await import("../../src/merge/reclaim.ts");

    try {
      const report = await mod.sweepReclaimCandidates([candidate(rel)], {
        rootDir: root,
        consent: true,
      });

      expect(lstats).toBeGreaterThan(1);
      const entry = onlyEntry(report);
      expect(entry.action).toBe("skipped-missing");
      expect(entry.detail).toContain("not re-created");
      expect(report).toMatchObject({ strippedCount: 0, deletedCount: 0 });
      // The whole point: nothing was written back.
      await expect(lstat(target)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      vi.doUnmock("node:fs/promises");
      vi.resetModules();
    }
  });

  // Same window, the other lane. Both reach one `skipped-missing` entry through
  // one writer, and the entry names what was NOT done — so a reduction reported
  // as a strip would tell the operator about a managed block their `.mcp.json`
  // never had.
  it("names the reduction, not a strip, when the co-owned target vanishes", async () => {
    const temp = tempDir();
    const root = temp.path("repo");
    const rel = ".mcp.json";
    const engineLine = "ENGINE-OWNED\n";
    const merged = `${engineLine}operator server\n`;
    await temp.seedFiles({ [`repo/${rel}`]: merged });
    const target = join(root, rel);

    let lstats = 0;
    vi.resetModules();
    const patched = {
      ...realFsPromises,
      lstat: async (...args: Parameters<typeof realFsPromises.lstat>) => {
        if (args[0] === target && lstats++ === 1) {
          await realFsPromises.rm(target, { force: true });
        }
        return await realFsPromises.lstat(...args);
      },
    };
    vi.doMock("node:fs/promises", () => ({ ...patched, default: patched }));
    const mod: typeof ReclaimApi = await import("../../src/merge/reclaim.ts");

    try {
      const report = await mod.sweepReclaimCandidates(
        [
          {
            entry: {
              path: rel,
              adapter: "claude",
              artifactId: "mcp",
              artifactType: "infra",
              contentHash: createHash("sha256").update(Buffer.from(merged, "utf8")).digest("hex"),
            },
            reason: "deselected",
          },
        ],
        {
          rootDir: root,
          consent: true,
          trustedExactPaths: new Set([rel]),
          coOwnedPaths: new Map<string, CoOwnedReducer>([
            [
              rel,
              (content: string): CoOwnedReduction => ({
                kind: "reduced",
                content: content.split(engineLine).join(""),
                detail: "Engine lines removed.",
              }),
            ],
          ]),
        },
      );

      expect(lstats).toBeGreaterThan(1);
      const entry = onlyEntry(report);
      expect(entry.action).toBe("skipped-missing");
      expect(entry.detail).toContain("nothing to reduce");
      expect(entry.detail).not.toContain("strip");
      expect(report).toMatchObject({ strippedCount: 0, deletedCount: 0 });
      await expect(lstat(target)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      vi.doUnmock("node:fs/promises");
      vi.resetModules();
    }
  });
});

describe("formatReclaimReport", () => {
  it("returns the empty string for an empty report", () => {
    expect(
      formatReclaimReport({
        entries: [],
        consent: true,
        deletedCount: 0,
        strippedCount: 0,
        skippedCount: 0,
      }),
    ).toBe("");
  });

  it("headlines a dry run as written-nothing and names the consent step", async () => {
    const temp = tempDir();
    const root = temp.path("repo");
    await temp.seedFiles({
      "repo/.cursor/rules/50-stamity-testing.mdc": managedWhole("engine rule"),
    });

    const text = formatReclaimReport(
      await sweepReclaimCandidates([candidate(".cursor/rules/50-stamity-testing.mdc")], {
        rootDir: root,
        consent: false,
      }),
    );

    expect(text).toContain("nothing written");
    expect(text).toContain("Re-run with consent");
    expect(text).toContain(".cursor/rules/50-stamity-testing.mdc");
  });

  it("headlines an applied sweep with its tallies and lists every entry", async () => {
    const temp = tempDir();
    const root = temp.path("repo");
    await temp.seedFiles({
      "repo/.cursor/rules/50-stamity-testing.mdc": managedWhole("engine rule"),
      "repo/.claude/agents/stamity-reviewer.md": `mine\n${managedWhole("engine body")}`,
      "repo/docs/README.md": "user doc\n",
    });

    const report = await sweepReclaimCandidates(
      [
        candidate(".cursor/rules/50-stamity-testing.mdc"),
        candidate(".claude/agents/stamity-reviewer.md"),
        candidate("docs/README.md"),
      ],
      { rootDir: root, consent: true },
    );
    const text = formatReclaimReport(report);

    expect(text.split("\n")).toHaveLength(4);
    // The headline counts the rewrite dispositions together — a stripped managed
    // block and a reduced co-owned document are one thing to the operator: the
    // engine's content left, the file did not.
    expect(text).toContain("1 deleted, 1 rewritten to keep user content, 1 skipped");
    expect(text).toContain("skipped-unsafe-path  docs/README.md");
  });

  it("still headlines a dry run as such when a candidate failed a gate", async () => {
    const temp = tempDir();
    const root = temp.path("repo");
    await temp.seedFiles({
      "repo/.cursor/rules/50-stamity-testing.mdc": managedWhole("engine rule"),
      "repo/docs/README.md": "user doc\n",
    });

    // Gates 1-4 run without consent too, so a refused candidate is reported as
    // its own `skipped-*` action rather than as `dry-run`. Inferring the mode
    // from the entries — "every one of them is dry-run" — therefore flipped to
    // the applied-sweep headline the moment ANY candidate failed a gate, which
    // is the common case: the report then claimed a sweep that never ran and
    // dropped the one line telling the operator how to make it run.
    const report = await sweepReclaimCandidates(
      [candidate(".cursor/rules/50-stamity-testing.mdc"), candidate("docs/README.md")],
      { rootDir: root, consent: false },
    );
    const text = formatReclaimReport(report);

    expect(report.entries.map((entry) => entry.action)).toEqual([
      "dry-run",
      "skipped-unsafe-path",
    ]);
    expect(text).toContain("Reclaim dry run");
    expect(text).toContain("nothing written");
    expect(text).toContain("1 would be acted on, 1 refused by a safety gate");
    expect(text).toContain("Re-run with consent");
    expect(text).not.toContain("Reclaim sweep");
    // Nothing was written, and the file both entries describe is still there.
    expect(await readFile(join(root, "docs/README.md"), "utf-8")).toBe("user doc\n");
  });
});
