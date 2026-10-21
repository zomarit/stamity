/**
 * The pack ids a release retired, and where each of their parts went
 * (REQ-PACK-002, REQ-PACK-003).
 *
 * A retired id is never a catalog id or a directory under `packs/` again, so
 * `stamity add <id>` on a bare id the catalog lacks can name the successors
 * instead of resolving the id as an npm package of that name
 * (`../cli/commands/add.ts`), and `check`'s `pack-catalog` row can name the
 * fix for a first-party copy still installed (`../cli/commands/check.ts`).
 * The catalog is always read first, so a fork that keeps its own directory
 * under a retired name resolves it as before.
 *
 * Zero imports, so any reader may take it (`test/architecture`, wave 1).
 */

/** One part of a retired pack: a skill, command, agent or rule it shipped. */
export interface RetiredPart {
  /** The part as the retired pack named it. */
  readonly part: string;
  /**
   * Where it went: a pack and the part's name there, the core when `pack` is
   * absent, or `null` when it was dropped.
   */
  readonly movedTo: { readonly pack?: string; readonly name: string } | null;
  /** Why, when the move alone does not say it (always worth one for a drop). */
  readonly note?: string;
}

/** A pack id no release ships any more. */
export interface RetiredPack {
  readonly id: string;
  /** The last release whose bundled catalog held the pack. */
  readonly lastShippedIn: string;
  /**
   * The aggregate content SHAs (`./trust.ts::computeAggregateContentSha`) of
   * every first-party copy that shipped, so an installed copy is recognised by
   * its content and never by its version.
   */
  readonly pins: readonly string[];
  readonly parts: readonly RetiredPart[];
}

/** The retired packs. Empty until a release retires one. */
export const RETIRED_PACKS: readonly RetiredPack[] = Object.freeze([]);

/** The retired pack with exactly `id`, or `undefined` when `map` holds none. */
export function lookupRetiredPack(
  id: string,
  map: readonly RetiredPack[] = RETIRED_PACKS,
): RetiredPack | undefined {
  return map.find((entry) => entry.id === id);
}

/** The packs `entry`'s parts moved to, in part order, each once. */
export function retiredSuccessorPacks(entry: RetiredPack): string[] {
  const packs: string[] = [];
  for (const { movedTo } of entry.parts) {
    const pack = movedTo?.pack;
    if (pack !== undefined && !packs.includes(pack)) packs.push(pack);
  }
  return packs;
}

/**
 * One line naming the release that retired `entry` and where each part went:
 * `pack "<id>" was retired after <ver>: <part> → <pack> <name>; <part> → dropped (<note>); …`.
 * A part moved into the core reads `→ core <name>`.
 */
export function describeRetiredPack(entry: RetiredPack): string {
  const parts = entry.parts.map(({ part, movedTo, note }) => {
    const where =
      movedTo === null ? "dropped" : `${movedTo.pack ?? "core"} ${movedTo.name}`;
    return `${part} → ${where}${note === undefined ? "" : ` (${note})`}`;
  });
  const tail = parts.length === 0 ? "" : `: ${parts.join("; ")}`;
  return `pack "${entry.id}" was retired after ${entry.lastShippedIn}${tail}`;
}
