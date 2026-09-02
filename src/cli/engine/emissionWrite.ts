import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { EmittedArtifact } from "../../manifest/ledger.ts";
import { planUserMcpJson, predictMcpMergeRefusal } from "../../manifest/mcpFilter.ts";
import type { PackSuppliedServer } from "../../mcp/catalog.ts";
import { engineOwnedServerIds } from "../../mcp/emit.ts";
import type { SafeWriteFileOptions } from "../../merge/safeWrite.ts";
import { discoverInstalledPacks, packMcpServers } from "../../pack/projection.ts";
import { outputOwners, type AdapterOutput, type MergeResult } from "../../types/content.ts";
import type { SetupManifest } from "../../types/manifest.ts";

/**
 * The write-side rules the two regeneration verbs must apply IDENTICALLY.
 *
 * `init` (`../commands/init/apply.ts`) and `sync` (`../commands/sync/engine.ts`)
 * are two different write loops on purpose — they differ in the replace lane,
 * the ledger rebuild scope, the collision gate, the reclaim sweep, the scaffold
 * ordering, the dry-run prediction, and how the manifest is composed — and
 * collapsing them into one flagged function would erase distinctions the
 * ownership model depends on. What may NOT differ is what a write means: which
 * lane an output takes, which bytes its authorship proof is computed over, what
 * a ledger row looks like, and which MCP ids the engine can prove it rendered.
 *
 * Those four questions used to be answered twice, once per verb, with comments
 * on both sides asking the reader to keep the copies in step by hand. Each is
 * answered exactly once here, so a divergence is impossible rather than merely
 * discouraged — because every one of them is silent when it goes wrong: the
 * ledger is a claim of authorship over a user's files, and a claim the two
 * writers spell differently is a claim that changes meaning depending on which
 * verb ran last.
 *
 * A fifth question joined them: what a DRY RUN of one of the three merged MCP
 * documents predicts ({@link predictMcpDocumentMerge}). It belongs here for the
 * same reason and by the same evidence — the two verbs answered it differently,
 * and the answers were both previews of the same regeneration.
 *
 * Nothing here touches the filesystem except {@link readIfExists} and
 * {@link predictMcpDocumentMerge}, which read. The write itself stays with the
 * caller: this module decides, the loops act.
 */

/**
 * Hash of emitted content, the ledger's authorship proof.
 *
 * ONE spelling for both writers. `contentHash` is consumed by re-hashing the
 * file on disk and comparing (`../../merge/reclaim.ts` gates 2b/4,
 * `../../merge/safeWrite.ts::hasLedgerDrift`), so a proof written by `init` has
 * to verify against a re-hash performed after `sync`, and vice versa. Two
 * implementations that agree today are two implementations that can stop
 * agreeing in one edit.
 *
 * `update(content)` with no encoding argument: a string defaults to UTF-8, and
 * naming it changes nothing — stated because the same digest is spelled with an
 * explicit `"utf8"` elsewhere in the tree and the equality is not obvious.
 */
export function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

/** File content, or `null` when the file does not exist. Other errnos propagate. */
export async function readIfExists(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException | null)?.code !== "ENOENT") throw err;
    return null;
  }
}

/**
 * The safe-write options one planned output gets — single-sourced so the plan's
 * prediction, init's write and sync's write can never diverge. An output whose
 * content carries a managed block takes the managed-merge lane with that block
 * body as `managedContent`; a marker-less output (hook scripts, plain JSON) is a
 * whole-file write.
 *
 * Passing the whole output as `managedContent` unconditionally routes
 * marker-less artifacts into `mergeManagedContent`, where `appendIfNoBlock`
 * treats the engine's OWN previous output as user-authored bytes to preserve: it
 * deny-scans them (the generated PreToolUse guard carries the injection
 * vocabulary it matches on, so a second `init --force` refused with
 * INTEGRITY_ERROR) and otherwise prepends a duplicate copy of the file above
 * itself. Both are second-run-only, which is why only re-init surfaced it.
 *
 * `boundaryDir` is the repo root — the same root every output path is joined
 * onto, so the writer's containment check answers the exact question the callers
 * can answer: these verbs emit into this tree and nowhere else. Without it the
 * substrate falls back to its structural rule, which cannot tell a monorepo's
 * in-repo alias (`.cursor/rules` → `shared/rules`) from a planted redirect and
 * refuses both.
 *
 * `ledgerHashes` rides alongside `ledgerPaths` and is built from the same rows.
 * Ownership alone told the writer the path is regenerable; the recorded hash is
 * what tells it whether the bytes STILL are. Without it a marker-less output the
 * engine owns — a hook script, one of the plain-JSON documents — that the
 * operator hand-edited is replaced outright on a plain flagless run, with no
 * `.bak` and no warning (`../../merge/safeWrite.ts::hasLedgerDrift`). Both are
 * optional because sync's PLAN lane needs neither at full strength: drift moves
 * the backup, never the disposition, so `predictMergeAction` still answers for
 * the write exactly.
 *
 * `backup: true` is stated rather than left to the default it already is. The
 * two writers spelled this differently — one explicit, one omitted — for no
 * behavioural reason (`../../merge/safeWrite.ts` reads only `backup === false`),
 * and a difference with no meaning is the kind a reader eventually gives one.
 */
export function outputWriteOptions(
  managedBody: string | null,
  engineVersion: string,
  force: boolean,
  rootDir: string,
  ledgerPaths?: ReadonlySet<string>,
  ledgerHashes?: ReadonlyMap<string, ReadonlySet<string>>,
): SafeWriteFileOptions {
  const base: SafeWriteFileOptions = {
    version: engineVersion,
    force,
    backup: true,
    boundaryDir: rootDir,
    ...(ledgerPaths === undefined ? {} : { ledgerPaths }),
    ...(ledgerHashes === undefined ? {} : { ledgerHashes }),
  };
  return managedBody === null
    ? base
    : { ...base, managedContent: managedBody, appendIfNoBlock: true };
}

/**
 * The ledger rows one written output earns — the row SHAPE both writers persist.
 *
 * Called only for a path the run actually wrote: a skipped path stayed
 * user-owned, and recording it would authorise a future reclaim sweep to act on
 * a file the engine never wrote. That gate belongs to the caller's loop, which
 * is where the skip is known.
 *
 * Co-owned outputs expand to one row PER owner — the ledger's multi-owner rows
 * are what let a shared path (the root `AGENTS.md`) survive deselection of one
 * tool (`../../manifest/ledger.ts`), and `outputOwners` collapses duplicate
 * adapters so no `(adapter, path)` pair can be recorded twice. The file itself
 * is still written exactly once by the caller.
 *
 * `written` is the bytes this run actually PUT ON DISK when they differ from the
 * emission — the three merged MCP documents, which land as emission ∪ preserved
 * operator content — and `null` when the write was the emission verbatim. The
 * hash goes over those bytes, not over the emission, and that is the whole
 * reason this argument exists: `contentHash` has exactly one reader, the reclaim
 * sweep (`../../merge/reclaim.ts` gates 2b/4), which re-hashes the file on disk
 * to prove the engine wrote it and nobody edited it since. Recording the
 * emission's hash for a merged document made the sweep read the engine's own
 * document as "edited since", so a deselected client doc could never be
 * auto-reclaimed and stayed behind as user content forever. Both writers carried
 * that bug, and both carried the fix; it lives here now so it cannot come back
 * on one side only.
 *
 * `stampedVersion` rides on `managedBody`, not on the run: an output with no
 * managed block has nowhere to stamp a version into, and recording one anyway
 * claimed a stamp in the great majority of outputs that carry no block at all.
 */
export function ledgerRowsForOutput(
  output: AdapterOutput,
  written: string | null,
  managedBody: string | null,
  engineVersion: string,
): EmittedArtifact[] {
  const contentHash = sha256(written ?? output.content);
  const rows: EmittedArtifact[] = [];
  for (const owner of outputOwners(output)) {
    rows.push({
      path: output.path,
      adapter: owner.adapter,
      artifactId: owner.artifactId,
      artifactType: owner.artifactType,
      contentHash,
      ...(managedBody === null ? {} : { stampedVersion: engineVersion }),
    });
  }
  return rows;
}

/** What a merge into one of the three shared MCP documents WOULD do. */
export interface McpMergePrediction {
  /**
   * The disposition, in the writer's own vocabulary — the same
   * {@link MergeResult} `materializeUserMcpJson` returns for these bytes, so a
   * caller reporting per-output can report the prediction verbatim.
   *
   * On a refusal it is `skipped` carrying {@link refusal} as its `warning`: the
   * write does not happen and the run does not stand behind the path, which is
   * what `skipped` already means to both writers' ledger loops.
   */
  result: MergeResult;
  /**
   * Why the write would refuse before merging at all — today, only a hard-linked
   * target. `null` when the merge would proceed. Carried beside the result
   * rather than left to be dug out of `result.warning`, because a caller that
   * classifies refusals (sync's plan lane types them) must not have to
   * string-match to tell one apart from a merge that merely warned.
   */
  refusal: string | null;
}

/**
 * What a merge into `absPath` would do, computed by running the REAL merge over
 * the bytes on disk and writing nothing.
 *
 * The one prediction both regeneration verbs preview these three paths with.
 * They used to answer it separately and differently, which made two previews of
 * one tree disagree: sync's plan ran this merge, so it reported `unchanged` for
 * an already-current document and a `shared-name` collision for one the write
 * would refuse, while init's dry run predicted from the target's mere EXISTENCE
 * — file there, therefore `updated`. So `init --force --dry-run` over a tree a
 * previous init had just written previewed work that would not happen, and no
 * init preview could show the hard-link refusal that init's own apply raises.
 * A dry run is a promise about the apply, and two verbs promising different
 * things about one tree means at least one promise is false.
 *
 * Order is load-bearing and is the reason the refusal check is inside this
 * function rather than left to each caller. `planUserMcpJson` reports a parse
 * failure by quoting the parser's message, which carries a fragment of whatever
 * it read, so a `.mcp.json` hard-linked to a binary key file would print part of
 * that key. Refusing ahead of the read means no linked byte is read, let alone
 * printed — the same ordering `../../manifest/mcpFilter.ts::refuseLinkedMcpTarget`
 * imposes on the write lane, mirrored here for the preview of it.
 *
 * `packServers` is threaded rather than defaulted for the reason it is
 * everywhere else on this lane ({@link installedPackServers}): predicting from a
 * narrower ownership set than the write will use is how a removal gets performed
 * but not previewed.
 */
export async function predictMcpDocumentMerge(
  absPath: string,
  relPath: string,
  emitted: string,
  selectedServers: readonly string[],
  packServers: readonly PackSuppliedServer[],
): Promise<McpMergePrediction> {
  const refusal = await predictMcpMergeRefusal(absPath);
  if (refusal !== null) {
    return { result: { path: absPath, action: "skipped", warning: refusal }, refusal };
  }
  const existing = await readIfExists(absPath);
  const { result } = planUserMcpJson(
    absPath,
    emitted,
    engineOwnedServerIds(relPath, selectedServers, existing, packServers),
    existing,
  );
  return { result, refusal: null };
}

/**
 * Every MCP server this repo's installed packs supply, read through the seam
 * emission resolves ids from (`../commands/config/mcp.ts` asks the identical
 * question of the identical pair, and asking it a second way would be a second
 * answer waiting to disagree).
 *
 * EVERY lane calls this — sync's plan, sync's apply, and init's write — off the
 * same ledger, because ownership is what the answer decides.
 * `engineOwnedServerIds` proves authorship of an UNSELECTED entry by
 * re-rendering it, and it can only render an id it can resolve — so a
 * pack-supplied entry the engine itself wrote is judged an unowned USER row
 * without these rows, and `../../manifest/mcpFilter.ts` then preserves it
 * verbatim. A deselected third-party server would never leave `.mcp.json`,
 * `.cursor/mcp.json` or `.vscode/mcp.json`, and would keep launching with the
 * credentials in `.env.mcp`. The PLAN lane asking the same question is the other
 * half: an empty answer there predicts `unchanged` for a document the apply lane
 * is about to rewrite, so `check` reports no drift across a revocation that
 * silently failed.
 *
 * On init it resolves non-empty exactly when the ledger handed in carries pack
 * rows: a first init has nothing installed and the answer is legitimately empty,
 * while a `--force` re-init over an installed pack answers with its servers,
 * because that run seeds the carried pack rows before asking. That is what makes
 * revocation reach init's lane at all — without those rows init could not prove
 * authorship of an entry it had itself emitted, kept it as an unowned user row,
 * and a server deselected across a re-init went on launching from all three
 * client documents.
 *
 * Reads nothing when the ledger carries no pack rows
 * (`../../pack/projection.ts`), so a repo with no packs installed pays for none
 * of this.
 */
export async function installedPackServers(
  rootDir: string,
  manifest: SetupManifest,
): Promise<PackSuppliedServer[]> {
  return packMcpServers(await discoverInstalledPacks(rootDir, manifest), rootDir);
}
