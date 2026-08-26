import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { ReclaimCandidate } from "../../src/manifest/ledger.ts";
import { wrapInManagedBlock } from "../../src/merge/managedBlocks.ts";
import {
  sweepReclaimCandidates,
  type ReclaimActionEntry,
  type ReclaimReport,
} from "../../src/merge/reclaim.ts";
import { TOOLS, type Tool } from "../../src/types/core.ts";
import { CONTENT_PREFIX, STATE_DIR } from "../../src/types/markers.ts";
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
 * How a fixture file proves — or fails to prove — engine authorship.
 *
 * - `engine-named-plain`  — engine-minted basename, no managed block.
 * - `engine-named-block`  — engine-minted basename wrapped whole in a block.
 * - `engine-ancestor`     — unprefixed file under an engine-minted DIRECTORY.
 * - `state-hashed`        — unprefixed name in the state dir, recorded hash MATCHES.
 * - `user-plain`          — unprefixed name, no hash, nowhere admissible.
 * - `user-edited-hash`    — state-dir path whose recorded hash MISMATCHES the
 *                           bytes: the user-edit survival case.
 */
const FIXTURE_KINDS = [
  "engine-named-plain",
  "engine-named-block",
  "engine-ancestor",
  "state-hashed",
  "user-plain",
  "user-edited-hash",
] as const;

type FixtureKind = (typeof FIXTURE_KINDS)[number];

interface FixtureFile {
  /** Which proof (or absence of one) this file was built to exercise. Carried
   *  only so the generator-coverage guard can see the space it produced. */
  kind: FixtureKind;
  /** Repo-relative POSIX path. */
  path: string;
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

const specArb = fc.record({
  kind: fc.constantFrom<FixtureKind>(...FIXTURE_KINDS),
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
 * Turn one generated spec into a concrete fixture file. The `f<index>/` prefix
 * gives every file a private subtree, which is what makes collisions between
 * two generated paths — a file where another file wants a directory — impossible
 * by construction rather than by filtering.
 */
function materialize(spec: FixtureSpec, index: number): FixtureFile {
  const nest = spec.dir.join("/");
  const stem = `${spec.name}${index}`;
  const common = {
    kind: spec.kind,
    reason: spec.reason,
    adapter: spec.adapter,
    coOwners: spec.coOwners,
  };

  switch (spec.kind) {
    case "engine-named-plain":
      return {
        ...common,
        path: `f${index}/${nest}/${CONTENT_PREFIX}${stem}.md`,
        content: `${spec.body}\n`,
        outcome: "deleted",
      };
    case "engine-named-block":
      return {
        ...common,
        path: `f${index}/${nest}/${CONTENT_PREFIX}${stem}.md`,
        content: wrapInManagedBlock(spec.body),
        outcome: "deleted",
      };
    case "engine-ancestor":
      // The engine mints the DIRECTORY; the file inside it carries no prefix of
      // its own, which is the skill-projection layout.
      return {
        ...common,
        path: `f${index}/${nest}/${CONTENT_PREFIX}${stem}/SKILL.md`,
        content: wrapInManagedBlock(spec.body),
        outcome: "deleted",
      };
    case "state-hashed":
      return {
        ...common,
        path: `${STATE_DIR}/f${index}/${nest}/${stem}.json`,
        content: `${spec.body}\n`,
        contentHash: sha256(`${spec.body}\n`),
        outcome: "deleted",
      };
    case "user-plain":
      return { ...common, path: `f${index}/${nest}/${stem}.md`, content: `${spec.body}\n`, outcome: "skipped-unsafe-path" };
    case "user-edited-hash":
      return {
        ...common,
        path: `${STATE_DIR}/f${index}/${nest}/${stem}.json`,
        content: `${spec.body}\n`,
        // The ledger recorded what the ENGINE wrote; the bytes on disk have
        // since been edited, so the hashes disagree and the edit survives.
        contentHash: sha256(`${spec.body}\nedited by hand\n`),
        outcome: "skipped-user-content",
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
    artifactType: "rule",
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
 * RAW data — path segments, bytes, recorded hash — rather than read off the
 * `outcome` column the fixture model declares.
 *
 * The distinction is the safety property's whole point. A property that selects
 * its check-set from its own expectation table stops examining a file the moment
 * that table is wrong, so a mis-declared row silently shrinks the invariant
 * instead of failing it. This predicate restates the ladder's two whole-file
 * ownership proofs from first principles — an engine-minted segment anywhere on
 * the path, or a state-dir path whose recorded hash still equals the bytes — and
 * the property below quantifies over its complement, so no declaration of ours
 * can excuse a file from the never-delete guarantee.
 */
function isProvablyEngineOwned(file: FixtureFile): boolean {
  const engineNamed = file.path.split("/").some((segment) => segment.startsWith(CONTENT_PREFIX));
  const hashProven =
    file.path.startsWith(`${STATE_DIR}/`) && file.contentHash === sha256(file.content);
  return engineNamed || hashProven;
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
  it("unlinks every file whose name, ancestor directory or recorded hash proves authorship", async () => {
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
          const path = `rules/${CONTENT_PREFIX}${name}.md`;
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
          const path = `agents/${CONTENT_PREFIX}${name}.md`;
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
