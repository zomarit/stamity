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

/** The notes two dropped parts each share. */
const GENERAL_KNOWLEDGE = "general knowledge; no pack carries it";
const PER_CHANGE_COST = "the core performance agent covers per-change cost";

/**
 * The retired packs. A part is named as its pack shipped it, a command as
 * `/<name>`; a pin is the aggregate of every copy a release tag's
 * `src/pack/catalogPins.ts` held for the id.
 */
export const RETIRED_PACKS: readonly RetiredPack[] = Object.freeze([
  Object.freeze({
    id: "ops",
    lastShippedIn: "1.16.0",
    pins: Object.freeze([
      // v1.0.0
      "c188457ee57b31e558b4aff46117e0964ea6c7c6f32171bd5af9976e4df7bcf6",
      // v1.0.1 to v1.11.0
      "90f6a36e3c9684069831071fa252d0603dc7dacbb0f60c9ff4a148f5881fb1ae",
      // v1.12.0 to v1.16.0
      "3e11beecbb12f97448ce5ef7c2fb55850654c7e369c52231219f43a45a76db20",
    ]),
    parts: Object.freeze([
      { part: "/st-release", movedTo: { pack: "production", name: "st-release" } },
      { part: "st-release-runbook", movedTo: { pack: "production", name: "st-release" } },
      { part: "/st-incident-response", movedTo: { pack: "production", name: "st-incident" } },
      { part: "st-incident-runbook", movedTo: { pack: "production", name: "st-incident" } },
      { part: "stamity-incident-responder", movedTo: { pack: "production", name: "st-incident" } },
      { part: "stamity-devops", movedTo: null, note: "its boundaries are part of production's st-release" },
      { part: "st-ci-pipeline", movedTo: null, note: GENERAL_KNOWLEDGE },
      { part: "st-containerize", movedTo: null, note: GENERAL_KNOWLEDGE },
      { part: "st-gh-agentic-workflows", movedTo: null, note: "tied to one vendor's workflow runner" },
    ]),
  }),
  Object.freeze({
    id: "product-audit",
    lastShippedIn: "1.16.0",
    pins: Object.freeze([
      // v1.0.0
      "8f88211025bffb0cbce73e394f7f5e88b7a71d46ed4c495f1c93eb2f4c1a99c3",
      // v1.0.1 and v1.1.0
      "064c8dda0d8444f54672ec569b70a30449495711bb299ea35d11aa03d8588649",
      // v1.2.0 to v1.14.0
      "42367889d11d31dfc8fd1e585ee8cc9e61f427ae294bdd9622b326aa40edce9d",
      // v1.15.0 and v1.16.0
      "d70744e72c7d98c0a448e08ee6307a7207a9020464cd51b3325f616492f1a726",
    ]),
    parts: Object.freeze([
      { part: "/st-product-audit", movedTo: { pack: "production", name: "/st-production-review" } },
      {
        part: "stamity-epic-audit-frame",
        movedTo: { pack: "production", name: "/st-production-review" },
        note: "its assessment loop is part of the review",
      },
      { part: "/st-benchmark", movedTo: null, note: PER_CHANGE_COST },
      { part: "st-perf-audit", movedTo: null, note: PER_CHANGE_COST },
    ]),
  }),
  Object.freeze({
    id: "scaffold",
    lastShippedIn: "1.16.0",
    pins: Object.freeze([
      // v1.0.0
      "0408b91e930020463f4015faa6305490f8b339936ea87f51cd9984a2323dfe3d",
      // v1.0.1 to v1.16.0
      "85016f7438a0fee7502593879155558a6514f425382d835d438701d9fddd6eba",
    ]),
    parts: Object.freeze([
      {
        part: "/st-design-system-create",
        movedTo: { pack: "frontend", name: "st-design-system-detect" },
        note: "proposes a minimal token set when none is found",
      },
      { part: "/st-slo-scaffold", movedTo: null, note: "production's review routes a missing SLO to /st-work" },
      { part: "/st-auth-scaffold", movedTo: null, note: "identity providers own authentication" },
    ]),
  }),
]);

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
