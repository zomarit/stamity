import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { ReclaimCandidate } from "../../src/manifest/ledger.ts";
import { OWNED_PATHS } from "../../src/manifest/ownedPaths.ts";
import { wrapInManagedBlock } from "../../src/merge/managedBlocks.ts";
import {
  sweepReclaimCandidates,
  type ReclaimActionEntry,
  type ReclaimReport,
} from "../../src/merge/reclaim.ts";
import { TOOLS, type Tool } from "../../src/types/core.ts";
import { CONTENT_PREFIX } from "../../src/types/markers.ts";
import { useTempDir } from "../support/tempDir.ts";

/**
 * Property lane for the deletion-safety ladder. `reclaim.test.ts` pins each
 * gate with a worked example; this file generalises the two invariants those
 * examples exist to protect, over trees the generator mixes freely:
 *
 * 1. A file the engine cannot prove it wrote is never unlinked, and its bytes
 *    are still on disk afterwards.
 * 2. A file the engine CAN prove it wrote is always acted on — no candidate
 *    quietly falls through the ladder into silence.
 *
 * TEST CHANGE, justified: REQ-PLUGIN-045 — the proof rule moved, so the model
 * is re-specified to it rather than narrowed. A path proves nothing outside
 * the owned-path bound; inside it, an engine-minted name proves a whole-file
 * delete only beside a recorded hash that matches the bytes (or a managed
 * block spanning the file), a hash alone proves one only in a state folder,
 * and a row with no hash proves nothing. The generator now draws paths from
 * inside the bound (content and state folders) and adds the adversarial kinds
 * the old rule got wrong — an engine name with no hash, a matching hash on an
 * unprefixed file in a content folder, and engine-looking paths outside the
 * bound — so both invariants are quantified over the new rule's whole space.
 *
 * Real-filesystem lane, for the same reason `reclaim.test.ts` uses it: the
 * subject's contract is `lstat` file-type discrimination, `realpath`
 * containment and an atomic rewrite, none of which a virtual volume expresses
 * faithfully. Generated paths stay POSIX-only and each fixture file owns a
 * disjoint `f<n>/` namespace, so no generated tree can collide a file against
 * another file's parent directory.
 *
 * Fixture writes are sequential (each is a mkdir + write on a path nothing else
 * touches) and the sweep itself is sequential by design, so the loops below are
 * ordered by necessity exactly as in the subject.
 */
/* oxlint-disable no-await-in-loop */

// Fixed seed: the suite must be deterministic run-to-run (CI contract). A
// counterexample replays with `fc.assert(..., { seed: 20260813, path: "<printed path>" })`.
// numRuns is lower than the pure-property house value of 200 because every run
// materialises a tree on disk; 30 runs x <=5 files keeps the file near a second.
const FC_PARAMS = { seed: 20260813, numRuns: 30 } as const;

/** Fixed so every `detail` string is a function of the fixture alone. */
const FIXED_NOW = new Date("2026-08-15T12:00:00.000Z");

const tempDir = useTempDir("stamity-reclaim-prop");

/** Monotonic per-file counter so each fc run gets a fresh repo root. */
let runCounter = 0;

// ── Fixture model ──────────────────────────────────────────────────────────

/**
 * How a fixture file proves — or fails to prove — engine authorship, under the
 * proof rule of REQ-PLUGIN-045.
 *
 * Owned (the sweep must delete):
 * - `engine-named-hashed`    — engine-minted basename in a content folder, no
 *                              block, recorded hash MATCHES.
 * - `engine-named-block`     — engine-minted basename wrapped whole in a block.
 * - `engine-ancestor-block`  — unprefixed file inside an engine-minted SKILL
 *                              folder (`skills/<prefix>…/`), wrapped whole.
 * - `engine-ancestor-hashed` — the same layout, no block, recorded hash MATCHES.
 * - `state-hashed`           — unprefixed name in a state folder, hash MATCHES.
 *
 * Not provable (the sweep must leave the bytes):
 * - `engine-named-hashless`  — engine-minted basename, no block, NO hash: a
 *                              name alone proves nothing.
 * - `engine-named-edited`    — engine-minted basename, hash MISMATCHES.
 * - `user-plain`             — unprefixed name in a content folder, no hash.
 * - `user-hashed-content`    — unprefixed name in a content folder whose hash
 *                              MATCHES: a hash alone proves nothing there.
 * - `user-edited-hash`       — state-folder path whose hash MISMATCHES: the
 *                              user-edit survival case.
 * - `outside-bound`          — an engine-minted name with a MATCHING hash at a
 *                              path no release writes (the shape a forged row
 *                              aimed `sync` with).
 */
const FIXTURE_KINDS = [
  "engine-named-hashed",
  "engine-named-block",
  "engine-ancestor-block",
  "engine-ancestor-hashed",
  "state-hashed",
  "engine-named-hashless",
  "engine-named-edited",
  "user-plain",
  "user-hashed-content",
  "user-edited-hash",
  "outside-bound",
] as const;

type FixtureKind = (typeof FIXTURE_KINDS)[number];

interface FixtureFile {
  /** Which proof (or absence of one) this file was built to exercise. Carried
   *  only so the generator-coverage guard can see the space it produced. */
  kind: FixtureKind;
  /** Repo-relative POSIX path. */
  path: string;
  /** The artifact type its ledger row records. */
  artifactType: "agent" | "skill" | "rule" | "command" | "infra";
  /** Bytes written to disk. */
  content: string;
  /** Hash recorded on the ledger row, when the kind records one. */
  contentHash?: string;
  reason: ReclaimCandidate["reason"];
  adapter: Tool;
  /** Extra owners of the same path, appended as duplicate ledger rows. */
  coOwners: Tool[];
  /** Whether the ladder must unlink this file, and under which action if not. */
  outcome: "deleted" | "skipped-unsafe-path" | "skipped-user-content";
}

const LOWER = "abcdefghijklmnopqrstuvwxyz";

/** Path segments: lower-case alphanumerics only — no `-`, so nothing a generator
 *  emits can accidentally carry the engine prefix or an ordering prefix. */
const wordArb = fc.string({
  unit: fc.constantFrom(...`${LOWER}0123456789`.split("")),
  minLength: 1,
  maxLength: 6,
});

/** User prose: never blank, never a frontmatter fence, never a marker. */
const proseArb = fc
  .string({ unit: fc.constantFrom(...`${LOWER} `.split("")), minLength: 1, maxLength: 24 })
  .filter((text) => text.trim() !== "");

const reasonArb = fc.constantFrom<ReclaimCandidate["reason"]>(
  "deselected",
  "adapter-removed",
  "path-renamed",
);

const toolArb = fc.constantFrom<Tool>(...TOOLS);

/** The content folders, drawn from the bound itself, and the skill folders
 *  among them (the only ones whose engine marker may sit on a container). */
const CONTENT_ROOTS = OWNED_PATHS.contentRoots;
const SKILL_ROOTS = CONTENT_ROOTS.filter((root) => root.endsWith("/skills/"));
const CONTENT_TYPES = ["agent", "skill", "rule", "command"] as const;

const specArb = fc.record({
  kind: fc.constantFrom<FixtureKind>(...FIXTURE_KINDS),
  contentRoot: fc.constantFrom(...CONTENT_ROOTS),
  skillRoot: fc.constantFrom(...SKILL_ROOTS),
  stateRoot: fc.constantFrom(...OWNED_PATHS.stateRoots),
  contentType: fc.constantFrom(...CONTENT_TYPES),
  dir: fc.array(wordArb, { minLength: 1, maxLength: 2 }),
  name: wordArb,
  body: proseArb,
  reason: reasonArb,
  adapter: toolArb,
  coOwners: fc.array(toolArb, { maxLength: 2 }),
});

type FixtureSpec = typeof specArb extends fc.Arbitrary<infer T> ? T : never;

const sha256 = (content: string): string =>
  createHash("sha256").update(Buffer.from(content, "utf8")).digest("hex");

/**
 * Turn one generated spec into a concrete fixture file. Every file gets a
 * private subtree keyed by its index — `f<index>/` below its folder, or the
 * index in the skill folder's own minted name — which is what makes
 * collisions between two generated paths impossible by construction rather
 * than by filtering.
 */
function materialize(spec: FixtureSpec, index: number): FixtureFile {
  const nest = spec.dir.join("/");
  const stem = `${spec.name}${index}`;
  const plain = `${spec.body}\n`;
  const common = {
    kind: spec.kind,
    reason: spec.reason,
    adapter: spec.adapter,
    coOwners: spec.coOwners,
  };
  const inContent = `${spec.contentRoot}f${index}/${nest}`;
  const content = { ...common, artifactType: spec.contentType };

  switch (spec.kind) {
    case "engine-named-hashed":
      return {
        ...content,
        path: `${inContent}/${CONTENT_PREFIX}${stem}.md`,
        content: plain,
        contentHash: sha256(plain),
        outcome: "deleted",
      };
    case "engine-named-block":
      return {
        ...content,
        path: `${inContent}/${CONTENT_PREFIX}${stem}.md`,
        content: wrapInManagedBlock(spec.body),
        outcome: "deleted",
      };
    case "engine-ancestor-block":
      // The engine mints the SKILL FOLDER directly under `skills/`; the files
      // inside it carry no prefix of their own (the skill-projection layout).
      return {
        ...content,
        path: `${spec.skillRoot}${CONTENT_PREFIX}${stem}/${nest}/SKILL.md`,
        content: wrapInManagedBlock(spec.body),
        outcome: "deleted",
      };
    case "engine-ancestor-hashed":
      return {
        ...content,
        path: `${spec.skillRoot}${CONTENT_PREFIX}${stem}/${nest}/reference.md`,
        content: plain,
        contentHash: sha256(plain),
        outcome: "deleted",
      };
    case "state-hashed":
      return {
        ...common,
        artifactType: "infra",
        path: `${spec.stateRoot}f${index}/${nest}/${stem}.json`,
        content: plain,
        contentHash: sha256(plain),
        outcome: "deleted",
      };
    case "engine-named-hashless":
      return {
        ...content,
        path: `${inContent}/${CONTENT_PREFIX}${stem}.md`,
        content: plain,
        outcome: "skipped-unsafe-path",
      };
    case "engine-named-edited":
      return {
        ...content,
        path: `${inContent}/${CONTENT_PREFIX}${stem}.md`,
        content: plain,
        // The ledger recorded what the ENGINE wrote; the bytes on disk have
        // since been edited, so the hashes disagree and the edit survives.
        contentHash: sha256(`${plain}edited by hand\n`),
        outcome: "skipped-user-content",
      };
    case "user-plain":
      return { ...content, path: `${inContent}/${stem}.md`, content: plain, outcome: "skipped-unsafe-path" };
    case "user-hashed-content":
      return {
        ...content,
        path: `${inContent}/${stem}.md`,
        content: plain,
        contentHash: sha256(plain),
        outcome: "skipped-unsafe-path",
      };
    case "user-edited-hash":
      return {
        ...common,
        artifactType: "infra",
        path: `${spec.stateRoot}f${index}/${nest}/${stem}.json`,
        content: plain,
        contentHash: sha256(`${plain}edited by hand\n`),
        outcome: "skipped-user-content",
      };
    case "outside-bound":
      return {
        ...content,
        path: `f${index}/${nest}/${CONTENT_PREFIX}${stem}.md`,
        content: plain,
        contentHash: sha256(plain),
        outcome: "skipped-unsafe-path",
      };
  }
}

const treeArb = fc
  .array(specArb, { minLength: 1, maxLength: 5 })
  .map((specs) => specs.map(materialize));

// ── Fixture plumbing ───────────────────────────────────────────────────────

/** A fresh repo root for one fc run, inside the test's temp directory. */
async function nextRoot(dir: string): Promise<string> {
  const root = join(dir, `run-${runCounter++}`);
  await mkdir(root, { recursive: true });
  return root;
}

const absolute = (root: string, path: string): string => join(root, ...path.split("/"));

/**
 * Seeds the tree. Takes only the two fields it writes, so the single-file tests
 * below hand it a path/content literal instead of a whole {@link FixtureFile}
 * whose classification fields it would ignore.
 */
async function writeTree(
  root: string,
  files: readonly Pick<FixtureFile, "path" | "content">[],
): Promise<void> {
  for (const file of files) {
    const target = absolute(root, file.path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, file.content, "utf8");
  }
}

/**
 * One ledger row: the fixture file as `adapter` would have claimed it. A pure
 * function of its two arguments, so it lives at module scope rather than being
 * rebuilt on every {@link candidatesFor} call.
 */
const candidateRow = (file: FixtureFile, adapter: Tool): ReclaimCandidate => ({
  entry: {
    path: file.path,
    adapter,
    artifactId: `artifact:${file.path}`,
    artifactType: file.artifactType,
    ...(file.contentHash === undefined ? {} : { contentHash: file.contentHash }),
  },
  reason: file.reason,
});

/**
 * Ledger rows for the tree: every file's primary row in tree order, then the
 * co-owner duplicates. Splitting them that way makes first-appearance order of
 * PATHS equal tree order while still handing the sweep repeated paths to group.
 */
function candidatesFor(files: readonly FixtureFile[]): ReclaimCandidate[] {
  const primary = files.map((file) => candidateRow(file, file.adapter));
  const duplicates = files.flatMap((file) =>
    file.coOwners.map((adapter) => candidateRow(file, adapter)),
  );
  return [...primary, ...duplicates];
}

function entryFor(report: ReclaimReport, path: string): ReclaimActionEntry {
  const entry = report.entries.find((candidate) => candidate.path === path);
  expect(entry, `no report entry for ${path}`).toBeDefined();
  return entry as ReclaimActionEntry;
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Whether the engine can prove it wrote this file, re-derived from the fixture's
 * RAW data — path segments, artifact type, bytes, recorded hash — rather than
 * read off the `outcome` column the fixture model declares.
 *
 * The distinction is the safety property's whole point. A property that selects
 * its check-set from its own expectation table stops examining a file the moment
 * that table is wrong, so a mis-declared row silently shrinks the invariant
 * instead of failing it. This predicate restates the ladder's whole-file
 * ownership proofs from first principles (REQ-PLUGIN-045): the path lies in a
 * content folder (for a content row) or a state folder (for an `infra` row);
 * a recorded hash, when there is one, still equals the bytes; and then either
 * the name is engine-minted — its basename, or a skill folder directly under
 * `skills/` — beside a matching hash or a block spanning the file, or the path
 * is in a state folder beside a matching hash. The property below quantifies
 * over its complement, so no declaration of ours can excuse a file from the
 * never-delete guarantee.
 *
 * TEST CHANGE, justified: REQ-PLUGIN-045 — the predicate restated the old
 * rule (an engine-minted segment anywhere, or any `.stamity/` path with a
 * matching hash); it now restates the bounded one.
 */
function isProvablyEngineOwned(file: FixtureFile): boolean {
  const segments = file.path.split("/");
  const inContentFolder =
    file.artifactType !== "infra" && CONTENT_ROOTS.some((root) => file.path.startsWith(root));
  const inStateFolder =
    file.artifactType === "infra" && OWNED_PATHS.stateRoots.some((root) => file.path.startsWith(root));
  if (!inContentFolder && !inStateFolder) return false;
  const hashMatches = file.contentHash !== undefined && file.contentHash === sha256(file.content);
  if (file.contentHash !== undefined && !hashMatches) return false;
  const blockSpans = /^<!-- STAMITY:BEGIN[^\n]*-->\n[\s\S]*\n<!-- STAMITY:END -->\n?$/.test(file.content);
  const engineNamed =
    (segments.at(-1) ?? "").startsWith(CONTENT_PREFIX) ||
    segments.some((segment, index) => segments[index - 1] === "skills" && segment.startsWith(CONTENT_PREFIX));
  return (inContentFolder && engineNamed && (hashMatches || blockSpans)) || (inStateFolder && hashMatches);
}

// ── Properties ─────────────────────────────────────────────────────────────

describe("reclaim — generator coverage", () => {
  /**
   * Guards the property space itself. The properties below are universally
   * quantified over `treeArb`, so a generator that stopped emitting the
   * mismatched-hash kind — the user-edit survival case — would keep every one of
   * them green while no longer testing the gate they exist for. Sampling the
   * exact seed and run budget the properties use makes that a failure here.
   */
  it("emits every fixture kind, both hash dispositions, and both outcomes", () => {
    const files = fc.sample(treeArb, FC_PARAMS).flat();
    const kinds = new Set(files.map((file) => file.kind));
    for (const kind of FIXTURE_KINDS) expect(kinds.has(kind), kind).toBe(true);

    // Matching AND mismatching recorded hashes: the two sides of gate 4.
    const hashed = files.filter((file) => file.contentHash !== undefined);
    const matching = hashed.filter((file) => file.contentHash === sha256(file.content));
    expect(matching.length).toBeGreaterThan(0);
    expect(hashed.length - matching.length).toBeGreaterThan(0);

    // Both dispositions present, so neither the delete side nor the survive
    // side of the ladder is being asked a one-sided question.
    expect(files.some((file) => file.outcome === "deleted")).toBe(true);
    expect(files.some((file) => file.outcome !== "deleted")).toBe(true);

    // Repeated paths reach the sweep, so the co-owner grouping path is live.
    expect(files.some((file) => file.coOwners.length > 0)).toBe(true);

    // TEST CHANGE, justified: REQ-PLUGIN-045 — the re-derived predicate agrees
    // with the expectation table on every generated file, so neither can drift
    // from the rule without the other noticing, and the space reaches every
    // part of the bound the generator draws from.
    for (const file of files) expect(isProvablyEngineOwned(file), file.path).toBe(file.outcome === "deleted");
    for (const root of CONTENT_ROOTS) expect(files.some((file) => file.path.startsWith(root)), root).toBe(true);
    for (const root of OWNED_PATHS.stateRoots) expect(files.some((file) => file.path.startsWith(root)), root).toBe(true);
  });
});

describe("reclaim — user files are never deleted", () => {
  it("leaves every unprovable candidate's bytes on disk, whatever the tree", async () => {
    const temp = tempDir();
    await fc.assert(
      fc.asyncProperty(treeArb, async (files) => {
        const root = await nextRoot(temp.dir);
        await writeTree(root, files);

        const report = await sweepReclaimCandidates(candidatesFor(files), {
          rootDir: root,
          consent: true,
          now: FIXED_NOW,
        });

        for (const file of files.filter((candidate) => candidate.outcome !== "deleted")) {
          const entry = entryFor(report, file.path);
          expect(entry.action).not.toBe("deleted");
          expect(entry.action).toBe(file.outcome);
          expect(await readFile(absolute(root, file.path), "utf8")).toBe(file.content);
        }
      }),
      FC_PARAMS,
    );
  });

  it("holds when provability is re-derived from the tree instead of the expectation table", async () => {
    const temp = tempDir();
    await fc.assert(
      fc.asyncProperty(treeArb, async (files) => {
        const root = await nextRoot(temp.dir);
        await writeTree(root, files);

        const report = await sweepReclaimCandidates(candidatesFor(files), {
          rootDir: root,
          consent: true,
          now: FIXED_NOW,
        });

        // Quantified over the complement of `isProvablyEngineOwned`, so this
        // property cannot be narrowed by an `outcome` label being wrong.
        for (const file of files.filter((candidate) => !isProvablyEngineOwned(candidate))) {
          expect(entryFor(report, file.path).action, file.path).not.toBe("deleted");
          expect(await readFile(absolute(root, file.path), "utf8")).toBe(file.content);
        }
      }),
      FC_PARAMS,
    );
  });

  it("never writes at all without consent, and reports every mutation it would make", async () => {
    const temp = tempDir();
    await fc.assert(
      fc.asyncProperty(treeArb, async (files) => {
        const root = await nextRoot(temp.dir);
        await writeTree(root, files);

        const report = await sweepReclaimCandidates(candidatesFor(files), {
          rootDir: root,
          consent: false,
          now: FIXED_NOW,
        });

        // Nothing was written, so both mutation tallies are zero. `skippedCount`
        // is NOT zero here: gates 1-4 run under a dry run too, and a refusal is
        // reported as its `skipped-*` action rather than downgraded to
        // `dry-run` — only a plan that WOULD have written becomes `dry-run`.
        // (`ReclaimReport.skippedCount`'s "a dry run tallies zero of each" reads
        // the other way; the behaviour here is the one the sweep implements.)
        expect(report).toMatchObject({ deletedCount: 0, strippedCount: 0 });
        expect(report.skippedCount).toBe(
          files.filter((file) => file.outcome !== "deleted").length,
        );
        for (const file of files) {
          const entry = entryFor(report, file.path);
          expect(entry.action).toBe(file.outcome === "deleted" ? "dry-run" : file.outcome);
          if (file.outcome === "deleted") {
            expect(entry.detail).toContain("Consent would delete this path");
            // TEST CHANGE, justified: REQ-PLUGIN-045 — the preview names what
            // consent would do and what proves it: a hash when one was
            // recorded (every hashed owned kind matches), else the block.
            expect(entry.wouldBe).toBe("deleted");
            expect(entry.proof).toBe(file.contentHash === undefined ? "block" : "hash");
          } else {
            expect(entry).not.toHaveProperty("proof");
          }
          // Every byte of the tree, provable or not, is still exactly as seeded.
          expect(await readFile(absolute(root, file.path), "utf8")).toBe(file.content);
        }
      }),
      FC_PARAMS,
    );
  });
});

describe("reclaim — provably owned candidates are always acted on", () => {
  // TEST CHANGE, justified: REQ-PLUGIN-045 — re-titled to the bounded rule;
  // the body is unchanged and quantifies over the re-specified model.
  it("unlinks every in-bound file whose engine name with a matching hash or block, or state-folder hash, proves authorship", async () => {
    const temp = tempDir();
    await fc.assert(
      fc.asyncProperty(treeArb, async (files) => {
        const root = await nextRoot(temp.dir);
        await writeTree(root, files);

        const report = await sweepReclaimCandidates(candidatesFor(files), {
          rootDir: root,
          consent: true,
          now: FIXED_NOW,
        });

        const owned = files.filter((file) => file.outcome === "deleted");
        for (const file of owned) {
          expect(entryFor(report, file.path).action).toBe("deleted");
          expect(await exists(absolute(root, file.path))).toBe(false);
        }
        expect(report.deletedCount).toBe(owned.length);
      }),
      FC_PARAMS,
    );
  });

  it("is never silent: one entry per distinct candidate path, in first-appearance order", async () => {
    const temp = tempDir();
    await fc.assert(
      fc.asyncProperty(treeArb, async (files) => {
        const root = await nextRoot(temp.dir);
        await writeTree(root, files);
        const candidates = candidatesFor(files);

        const report = await sweepReclaimCandidates(candidates, {
          rootDir: root,
          consent: true,
          now: FIXED_NOW,
        });

        // Rows sharing a path collapse to one action, and the surviving order is
        // the order the paths first appear in the ledger — not a re-sort.
        expect(report.entries.map((entry) => entry.path)).toEqual([
          ...new Set(candidates.map((candidate) => candidate.entry.path)),
        ]);
        expect(report.deletedCount + report.strippedCount + report.skippedCount).toBe(
          report.entries.length,
        );
      }),
      FC_PARAMS,
    );
  });
});

describe("reclaim — determinism", () => {
  it("produces byte-identical reports for two identical trees", async () => {
    const temp = tempDir();
    await fc.assert(
      fc.asyncProperty(treeArb, async (files) => {
        const candidates = candidatesFor(files);
        const options = { consent: true, now: FIXED_NOW } as const;

        const rootA = await nextRoot(temp.dir);
        await writeTree(rootA, files);
        const first = await sweepReclaimCandidates(candidates, { ...options, rootDir: rootA });

        const rootB = await nextRoot(temp.dir);
        await writeTree(rootB, files);
        const second = await sweepReclaimCandidates(candidates, { ...options, rootDir: rootB });

        // `detail` included: with `now` pinned, no entry may carry a value that
        // varies with the root path or the run.
        expect(second.entries).toEqual(first.entries);
      }),
      FC_PARAMS,
    );
  });
});

describe("reclaim — co-owned rows", () => {
  it("reports the precedence-winning reason and names every owner", async () => {
    const temp = tempDir();
    await fc.assert(
      fc.asyncProperty(
        wordArb,
        proseArb,
        fc.array(fc.tuple(reasonArb, toolArb), { minLength: 2, maxLength: 4 }),
        async (name, body, rows) => {
          const root = await nextRoot(temp.dir);
          // TEST CHANGE, justified: REQ-PLUGIN-045 — a root-level `rules/`
          // folder lies outside the owned-path bound; the shared path sits in a
          // rule folder the engine writes. The block still proves the delete.
          const path = `.claude/rules/${CONTENT_PREFIX}${name}.md`;
          await writeTree(root, [{ path, content: wrapInManagedBlock(body) }]);

          const rank: Record<ReclaimCandidate["reason"], number> = {
            "adapter-removed": 0,
            "path-renamed": 1,
            deselected: 2,
          };
          const candidates: ReclaimCandidate[] = rows.map(([reason, adapter]) => ({
            entry: { path, adapter, artifactId: `artifact:${path}`, artifactType: "rule" },
            reason,
          }));

          const report = await sweepReclaimCandidates(candidates, {
            rootDir: root,
            consent: true,
            now: FIXED_NOW,
          });

          const entry = entryFor(report, path);
          const winner = rows
            .map(([reason]) => reason)
            .reduce((best, reason) => (rank[reason] < rank[best] ? reason : best));
          expect(entry.candidateReason).toBe(winner);
          expect(entry.action).toBe("deleted");

          // Distinct `reason (adapter)` labels are all recited; a single label
          // repeated across rows collapses and the provenance clause is dropped.
          const labels = [...new Set(candidates.map((c) => `${c.reason} (${c.entry.adapter})`))];
          if (labels.length > 1) {
            for (const label of labels) expect(entry.detail).toContain(label);
          }
        },
      ),
      FC_PARAMS,
    );
  });
});

describe("reclaim — managed-block strip preserves user bytes", () => {
  it("keeps every byte outside the block when user content vetoes the unlink", async () => {
    const temp = tempDir();
    await fc.assert(
      fc.asyncProperty(
        wordArb,
        proseArb,
        proseArb,
        proseArb,
        async (name, prefix, body, suffix) => {
          const root = await nextRoot(temp.dir);
          // TEST CHANGE, justified: REQ-PLUGIN-045 — a root-level `agents/`
          // folder lies outside the owned-path bound; the file sits in an agent
          // folder the engine writes.
          const path = `.claude/agents/${CONTENT_PREFIX}${name}.md`;
          // Markers only count on their own lines, so the user prefix ends with
          // a newline and the suffix starts on the line after the END marker.
          const content = `${prefix}\n${wrapInManagedBlock(body)}${suffix}\n`;
          await writeTree(root, [{ path, content }]);

          const report = await sweepReclaimCandidates(
            [
              {
                entry: { path, adapter: "claude", artifactId: `artifact:${path}`, artifactType: "agent" },
                reason: "deselected",
              },
            ],
            { rootDir: root, consent: true, now: FIXED_NOW },
          );

          // The name proves authorship, so the file COULD be unlinked; the user
          // bytes outside the block are what downgrade it to a strip.
          expect(entryFor(report, path).action).toBe("managed-block-stripped");
          // `before + after`: the block is excised, and the newline that
          // terminated the END marker line is the seam between the two runs.
          expect(await readFile(absolute(root, path), "utf8")).toBe(`${prefix}\n\n${suffix}\n`);
        },
      ),
      FC_PARAMS,
    );
  });
});
