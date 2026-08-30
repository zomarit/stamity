import { createHash } from "node:crypto";
import { chmod, link, lstat, mkdir, readFile, readdir, symlink } from "node:fs/promises";
// Namespace import of the REAL module, so the one case that has to change the
// tree mid-sweep can delegate to the unpatched calls from inside its replacement.
import * as realFsPromises from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { ReclaimCandidate } from "../../src/manifest/ledger.ts";
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

/** A ledger row the sweep may act on. Defaults describe the common case: one
 *  cursor-owned rule the current emission no longer produces. */
function candidate(
  path: string,
  reason: ReclaimCandidate["reason"] = "deselected",
  adapter: Tool = "cursor",
): ReclaimCandidate {
  return {
    entry: { path, adapter, artifactId: `artifact:${path}`, artifactType: "rule" },
    reason,
  };
}

const PACK_FILE = ".stamity/packs/acme__ops/agents/reviewer.md";
const PACK_BODY = "---\nid: reviewer\n---\nReview the change.\n";

/**
 * A row for content the engine installed verbatim: a name it did not mint, no
 * managed block, and the hash of the bytes it wrote. The recorded hash is the
 * only ownership proof such a file has.
 */
function hashedCandidate(path: string, content: string): ReclaimCandidate {
  return {
    entry: {
      path,
      adapter: "pack:@acme/ops",
      artifactId: "@acme/ops/agents/reviewer.md",
      artifactType: "infra",
      contentHash: createHash("sha256").update(Buffer.from(content, "utf8")).digest("hex"),
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
        candidate(".claude/agents/stamity-implementer.md", "adapter-removed", "claude"),
        candidate(".stamity/mcp/stamity-servers.json"),
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

  it("refuses a path whose basename carries no ownership marker", async () => {
    const temp = tempDir();
    const root = temp.path("repo");
    await temp.seedFiles({ "repo/docs/README.md": "user doc\n" });

    const report = await sweepReclaimCandidates([candidate("docs/README.md")], {
      rootDir: root,
      consent: true,
    });

    expect(onlyEntry(report).detail).toContain("ownership marker");
    expect(await readFile(join(root, "docs/README.md"), "utf-8")).toBe("user doc\n");
  });

  it("does not read the marker off an ancestor directory that merely carries the prefix", async () => {
    const temp = tempDir();
    const root = temp.path("repo");
    // A directory the USER named after the engine, holding a file the engine
    // never wrote. The marker used to be read off any segment, so this cleared
    // gate 2 and reached the whole-file delete branch on the strength of a name
    // that says nothing about the file underneath it.
    await temp.seedFiles({ "repo/stamity-tools/user.md": "mine\n" });

    const report = await sweepReclaimCandidates([candidate("stamity-tools/user.md")], {
      rootDir: root,
      consent: true,
    });

    const entry = onlyEntry(report);
    expect(report.deletedCount).toBe(0);
    expect(entry.action).toBe("skipped-user-content");
    // The prefixed directory keeps the sweep reading, and the bytes then have to
    // close the claim; they do not, so the file stays.
    expect(entry.detail).toContain("the directory, not this file");
    expect(await readFile(join(root, "stamity-tools/user.md"), "utf-8")).toBe("mine\n");
  });

  it("still reclaims the same shape once the bytes prove the engine wrote it", async () => {
    const temp = tempDir();
    const root = temp.path("repo");
    // The other half of the provisional rule: a prefixed container is a hint,
    // and a managed block spanning the file is the proof that closes it.
    await temp.seedFiles({ "repo/stamity-tools/emitted.md": managedWhole("engine body") });

    const report = await sweepReclaimCandidates([candidate("stamity-tools/emitted.md")], {
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
        candidate(".stamity/mcp/stamity-servers.json", "adapter-removed", "claude"),
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

    const report = await sweepReclaimCandidates(
      [candidate(".agents/skills/stamity-verify/references/ui.md")],
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
        candidate(".agents/skills/stamity-verify/references/ui.md", "path-renamed", "claude"),
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

    const report = await sweepReclaimCandidates(
      [candidate(".agents/skills/st-verify/references/ui.md")],
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
        candidate(".windsurf/rules/stamity-gone.md"),
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
    await temp.seedFiles({ "repo/AGENTS.md": PACK_BODY });

    const report = await sweepReclaimCandidates([hashedCandidate("AGENTS.md", PACK_BODY)], {
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

    const report = await sweepReclaimCandidates([candidate(PACK_FILE)], {
      rootDir: root,
      consent: true,
    });

    expect(onlyEntry(report).action).toBe("skipped-unsafe-path");
    expect(await readFile(join(root, PACK_FILE), "utf-8")).toBe(PACK_BODY);
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
    await temp.seedFiles({ "repo/AGENTS.md": PACK_BODY });

    // The blast-radius guard: declaring one path co-owned must not change how any
    // other trusted hash-proved path is judged, or the fix would have withdrawn
    // the block-less-infra uninstall it is not about.
    const report = await sweepReclaimCandidates([hashedCandidate("AGENTS.md", PACK_BODY)], {
      rootDir: root,
      consent: true,
      trustedExactPaths: new Set(["AGENTS.md"]),
      coOwnedPaths: reducerFor(CO_OWNED),
    });

    expect(onlyEntry(report).action).toBe("deleted");
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
