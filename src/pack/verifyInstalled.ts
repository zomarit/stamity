import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import pLimit from "p-limit";
import { EngineError } from "../types/errors.ts";
import { isPackOwner, PACK_OWNER_PREFIX, type SetupManifest } from "../types/manifest.ts";

/**
 * Post-install re-verification of pack content: the read half of a promise the
 * install made and nothing kept.
 *
 * `./install.ts` records a SHA-256 for every byte it lands, as the
 * `contentHash` of the pack's ledger row. Until this module, the only reader
 * of those hashes was the reclaim sweep at DELETE time (`../merge/reclaim.ts`
 * gate 2c) — which asks "may I unlink this", never "is this still what was
 * installed". So an edit to `.stamity/packs/**` after `add` returned was
 * invisible: `check` reported it as ordinary regeneration drift, the remedy it
 * recommends (`sync`) PROPAGATED the edited bytes into the emitted
 * `.claude/agents/*.md`, and the next `check` was clean forever while the
 * ledger and the disk disagreed. The ingress deny scan rode the same gap —
 * `scanPackBodies` is install-only by its own contract, so a phrase refused at
 * the door installed cleanly when appended afterwards.
 *
 * Three properties, all of them deliberate:
 *
 * - **Read-only.** Nothing here writes, renames, or unlinks. What to DO about
 *   a mismatch is the operator's decision (re-install the pack, or accept the
 *   edit); a verifier that repaired would destroy the evidence and, for an
 *   edit the operator made on purpose, their work.
 * - **Never throws on a mismatch.** A tampered or edited file is a FINDING,
 *   because the caller is a diagnostic surface that has other rows to print.
 *   Only a manifest-shaped defect — a ledger row whose owner cannot be read as
 *   a pack id — is an error, and that is a `FS_ERROR` from the read itself.
 * - **Ledger-driven, not directory-driven.** The rows are the record of what
 *   the install landed. Walking `.stamity/packs/` instead would report a file
 *   the operator ADDED as a pack file and miss one they deleted; the rows
 *   report both correctly, a deleted file as `actual: null`.
 *
 * Rows with no `contentHash` are skipped rather than reported. A row without
 * one records no expectation, so there is nothing to compare against and
 * inventing a finding would say "changed" about a file nobody ever hashed.
 */

/** Concurrent re-hashes. Matches the bound the install's own reads use. */
const READ_CONCURRENCY = 8;

/** One installed pack file whose bytes no longer match what the install recorded. */
export interface PackIntegrityFinding {
  /** Pack the row belongs to, as the `pack:<id>` ledger owner spells the id. */
  packId: string;
  /** Repo-relative POSIX path of the file, from the ledger row. */
  relPath: string;
  /** SHA-256 the install recorded for the bytes it wrote. */
  expected: string;
  /** SHA-256 of the bytes on disk now, or `null` when the file is gone. */
  actual: string | null;
  /**
   * The arguments that re-add this pack from the source its install receipt
   * records, or `null`/absent when the receipt is missing, edited or
   * unreadable — the re-install order then names the pack and says to add it
   * from where it came from (review/59). This pass leaves it absent: reading
   * the receipt and the curated catalog sits above this module's layer, so
   * the caller fills it (`check`'s `withReAddArgs`).
   */
  reAdd?: string | null;
}

/** What one verification pass looked at, and what it found. */
export interface PackIntegrityReport {
  /** Rows re-hashed — pack-owned rows carrying a recorded hash. */
  checked: number;
  /** Every disagreement, in ledger order; empty for an untouched install. */
  findings: PackIntegrityFinding[];
}

/**
 * Re-hash every pack-owned ledger row and report the ones that disagree with
 * the hash the install recorded.
 *
 * A missing file yields `actual: null` and IS a finding: the row says the
 * install landed that file, and something outside the engine removed it. That
 * is the same class of surprise as an edit — the repo no longer holds what the
 * ledger says it holds — and the operator's next step (`clean --pack <id>`,
 * then re-install) is the same. Reporting it also keeps the pass total: a
 * verifier that treated absence as "nothing to check" would go quiet exactly
 * when a pack was deleted by hand.
 *
 * `manifest` is the caller's already-read manifest rather than a path, so a
 * command that has one does not read it twice and one that is verifying a
 * manifest it holds in memory checks THAT one.
 */
export async function verifyInstalledPacks(
  rootDir: string,
  manifest: SetupManifest,
): Promise<PackIntegrityReport> {
  const root = resolve(rootDir);
  const rows = manifest.ledger.filter(
    (entry) => isPackOwner(entry.adapter) && entry.contentHash !== undefined,
  );

  const results = await pLimit(READ_CONCURRENCY).map(rows, async (entry) => {
    const expected = (entry.contentHash as string).toLowerCase();
    const actual = await hashIfPresent(join(root, ...entry.path.split("/")));
    if (actual === expected) return null;
    return {
      packId: entry.adapter.slice(PACK_OWNER_PREFIX.length),
      relPath: entry.path,
      expected,
      actual,
    };
  });

  return {
    checked: rows.length,
    findings: results.filter((finding): finding is PackIntegrityFinding => finding !== null),
  };
}

/**
 * SHA-256 of the bytes at `absPath`, or `null` when nothing is there.
 *
 * Absence is an answer, not a failure — a file the operator deleted is exactly
 * what this pass exists to notice. A path that turned out to be a directory
 * answers `null` too: whatever it is, it is not the file the install wrote.
 * Every other errno is a real filesystem fault and propagates, because a
 * verifier that swallowed a permission failure would report "clean" about
 * bytes it never read.
 */
async function hashIfPresent(absPath: string): Promise<string | null> {
  try {
    return createHash("sha256").update(await readFile(absPath)).digest("hex");
  } catch (cause) {
    const code = (cause as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR" || code === "EISDIR") return null;
    throw new EngineError(
      `Cannot read installed pack file ${absPath}: ${code ?? (cause instanceof Error ? cause.message : String(cause))}.`,
      { code: "FS_ERROR", cause },
    );
  }
}

/**
 * The order that re-installs pack `packId`, worded once for every surface that
 * prints it — each finding line below and `check`'s next-steps block, which
 * passes its own `call` for the pinned command form — so one `check` run never
 * prints two orders (review/58).
 *
 * `edited` names the edited file(s) to deal with first, or is `null` when
 * there are none. An edited file is the case the bare order missed
 * (review/56): `clean --pack` keeps a file whose bytes no longer match its row
 * rather than deleting it, so the edit is not lost, and drops the row — so the
 * later `add` meets a file its pack does not own at its own path and refuses.
 * Moving it out of the pack's directory (or deleting it) first is what lets
 * the four steps run. `sync` never runs before `clean --pack`: it would carry
 * the current bytes into the generated setup.
 *
 * `reAdd` is what follows `add`: the source the pack's receipt records
 * (`check`'s `reAddArgsOf`), or a placeholder the caller explains. `null` means
 * no receipt could name it, and the step says so in words rather than print
 * an `add` that would not run (review/59).
 */
export function packReinstallSteps(
  packId: string,
  edited: string | null,
  reAdd: string | null,
  call: (args: string) => string = (args) => `\`${args}\``,
): string {
  const first =
    edited === null
      ? ""
      : `move ${edited} out of the pack's directory or delete it first — clean --pack keeps an ` +
        `edited pack file rather than deleting it, so the edit is not lost, and add would refuse ` +
        `it as a file the pack does not own; then `;
  const add =
    reAdd === null
      ? `add pack "${packId}" again from the source you installed it from (its install receipt ` +
        `is missing or unreadable, so that source cannot be named here)`
      : call(`add ${reAdd}`);
  return (
    `${first}run ${call(`clean --pack ${packId}`)}, then ${call("sync")}, then ` +
    `${add}, then ${call("sync")}`
  );
}

/**
 * One finding as a diagnostic line, in integrity vocabulary rather than drift
 * vocabulary.
 *
 * The distinction is the point of the whole module and belongs here rather
 * than at each caller: "regeneration drift" invites `sync`, which for an
 * edited pack body LAUNDERS the edit into the emitted setup. An integrity
 * mismatch invites re-installing the pack, in {@link packReinstallSteps}'
 * order, and the line says so by name.
 */
export function describePackIntegrityFinding(finding: PackIntegrityFinding): string {
  const state =
    finding.actual === null
      ? "is missing from the repo"
      : `hashes to ${finding.actual.slice(0, 12)}…, not the ${finding.expected.slice(0, 12)}… the install recorded`;
  return (
    `${finding.relPath} ${state} — installed pack "${finding.packId}" no longer matches what was ` +
    `verified at install. This is not regeneration drift: \`sync\` would carry the current bytes ` +
    `into the generated setup. Restore the file, or re-install the pack: ` +
    `${packReinstallSteps(
      finding.packId,
      finding.actual === null ? null : "this file",
      finding.reAdd ?? null,
    )}.`
  );
}
