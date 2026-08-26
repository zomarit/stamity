/**
 * The per-class content reference pages, projected from artifact frontmatter.
 *
 * The drift class this closes: a hand-written page listing what the
 * corpus ships is true on the day it is typed and silently false the first
 * time an artifact is added, renamed, retired, or re-tagged. Every line here
 * is a projection of a frontmatter field the catalog already parsed — id,
 * description, tags, `load`, `obsolete_when` — so the pages cannot claim an
 * artifact the corpus does not carry, or miss one it does.
 *
 * **Frontmatter only; bodies are never restated.** The artifact IS its body;
 * a reference page that paraphrased it would become a second, staler copy of
 * the thing it points at. `description` carries the whole behavioural claim
 * because that is what it is for — the trigger a client reads to decide
 * whether to load the artifact at all.
 *
 * **Refuse-to-render on a defective artifact.** A missing `description` or
 * `obsolete_when` throws `EngineError` naming the artifact, rather than
 * rendering a blank cell that reads as "this artifact has no trigger". The
 * corpus frontmatter contract already gates those fields, so only a broken
 * checkout reaches this guard — it exists so the page can never be the place
 * the defect first becomes invisible.
 *
 * **The lane's base module.** The four docs renderers are one unit with no
 * fifth file to hold shared parts, so each owns what it introduces and the
 * siblings above it import: this module owns {@link REGENERATE_COMMAND} and
 * {@link generatedBanner} (all four pages carry them), `configReference` adds
 * the markdown table primitives, `cliReference` builds on both, and
 * `llmsIndex` sits on top listing every page. This module is deliberately the
 * base: it is the only renderer with no CLI-layer import, so a sibling
 * reaching it never drags the CLI entry into a pure content projection.
 *
 * Pure and clock-free apart from the corpus read: two runs over one tree are
 * byte-identical, and artifacts render in id order rather than walk order so
 * a filename change alone cannot reshuffle a page.
 */

import { readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  COMMAND_ID_PREFIX,
  buildContentIndex,
  type CatalogItem,
  type ContentIndex,
} from "../../content/catalog.ts";
import { lookupCatalogEntry } from "../../pack/curated.ts";
import {
  PACK_MANIFEST_FILE,
  enumeratePackContent,
  readPackManifest,
  type PackContentFile,
  type PackManifest,
} from "../../pack/manifest.ts";
import { findPackageRoot } from "../../shared/paths.ts";
import { CONTENT_CLASSES, type ContentClass } from "../../types/content.ts";
import { EngineError } from "../../types/errors.ts";

/** The one command that rewrites every generated page in this lane. */
export const REGENERATE_COMMAND = "node scripts/generate-docs.mjs";

/** Directory holding the per-class reference pages. */
const REFERENCE_DOC_DIR = "docs/reference";

/** Repo-relative directory the first-party packs are authored in. */
const PACKS_DIR = "packs";

// ── Shared page primitives ───────────────────────────────────────

/**
 * The do-not-edit header every generated page opens with. One phrasing for
 * the whole lane: a reader who lands on any page learns the same fact and the
 * same repair, and the regeneration command appears exactly once per page.
 */
export function generatedBanner(): string {
  return `<!-- GENERATED FILE — do not edit by hand. Rewrite it with \`${REGENERATE_COMMAND}\`. -->`;
}

function fail(message: string): never {
  throw new EngineError(message, { code: "VALIDATION_ERROR" });
}

/**
 * A frontmatter value that must be present for the projection to mean
 * anything. Blank counts as missing: a whitespace-only `obsolete_when` states
 * a retirement condition just as poorly as an absent one.
 */
function requireField(item: CatalogItem, field: string, value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    fail(
      `The ${item.type} "${item.id}" (${item.relativePath}) declares no \`${field}\`, so its ` +
        `reference entry would render an empty ${field}. Add \`${field}\` to its frontmatter.`,
    );
  }
  return value.trim().replace(/\s*\r?\n\s*/g, " ");
}

// ── Page registry ────────────────────────────────────────────────

/** What one reference page is: where it lands, what it covers, how it reads. */
export interface ReferencePageSpec {
  /** Repo-relative path of the committed page. */
  readonly path: string;
  /** H1 of the page. */
  readonly title: string;
  /** The corpus class it projects, or `"packs"` for the pack inventory. */
  readonly covers: ContentClass | "packs";
  /** One-line description of the page — reused verbatim by the llms.txt index. */
  readonly blurb: string;
  /** Opening paragraph: what this class is and how a client loads it. */
  readonly intro: string;
}

/**
 * Per-class page copy. A total `Record<ContentClass, …>` on purpose: adding a
 * content class fails to compile here instead of shipping a corpus whose new
 * class has no reference page.
 */
const CLASS_PAGES: Record<ContentClass, Omit<ReferencePageSpec, "covers">> = {
  agent: {
    path: `${REFERENCE_DOC_DIR}/agents.md`,
    title: "Agents",
    blurb: "every agent in the corpus — its trigger, tags, load mode and retirement condition.",
    intro:
      "An agent is a role a client spawns for one bounded job. Its `description` is the " +
      "trigger the spawning side reads to decide whether this role fits the work, so it " +
      "states the job rather than advertising the role. Authored in `content/agents/`.",
  },
  skill: {
    path: `${REFERENCE_DOC_DIR}/skills.md`,
    title: "Skills",
    blurb: "every skill in the corpus — its trigger, tags, load mode and retirement condition.",
    intro:
      "A skill is a procedure an agent runs when the work calls for it. Its `description` " +
      "is the trigger a client matches against the task at hand — it is the only part " +
      "always in context, so it carries the whole activation claim. Authored in " +
      "`content/skills/<id>/SKILL.md`.",
  },
  rule: {
    path: `${REFERENCE_DOC_DIR}/rules.md`,
    title: "Rules",
    blurb: "every rule in the corpus — its trigger, tags, load mode and retirement condition.",
    intro:
      "A rule is a constraint that binds work in this repository. `load` states when it " +
      "enters context: `always` for the floor a client must never work without, " +
      "`on-demand` for constraints scoped to files or tasks. Authored in `content/rules/`.",
  },
  command: {
    path: `${REFERENCE_DOC_DIR}/commands.md`,
    title: "Commands",
    blurb: "every command in the corpus — its trigger, tags, load mode and retirement condition.",
    intro:
      "A command is a touchpoint a human types. Ids carry the " +
      `\`${COMMAND_ID_PREFIX}\` prefix the catalog applies so a command can never shadow a ` +
      "skill or agent of the same name; the typed touchpoint drops it. Authored in " +
      "`content/commands/`.",
  },
};

/**
 * The pack inventory page — one entry per first-party pack directory.
 *
 * The update sentence lives HERE, in the generator, rather than in the page
 * bytes: `packs.md` is byte-compared against this render, so a fact typed into
 * the committed file would be erased by the next regeneration. It is also a
 * fact a reader cannot get anywhere else — no pack source has an auto-update
 * path, first-party or org-allowlisted, and nothing else in the product says
 * that re-adding IS the update.
 */
const PACKS_PAGE: ReferencePageSpec = {
  path: `${REFERENCE_DOC_DIR}/packs.md`,
  title: "Packs",
  covers: "packs",
  blurb: "the first-party packs `add` can install, and what each one ships.",
  intro:
    "A pack is content installed on top of the corpus behind the trust ladder. Packs ship " +
    "across several classes at once, so they get one inventory rather than a row on each " +
    `class page. Authored in \`${PACKS_DIR}/\`; each entry below is read from that pack's ` +
    `\`${PACK_MANIFEST_FILE}\` and its class directories.\n\n` +
    "**Updating a pack means adding it again.** There is no auto-update path for any pack " +
    "source — not for the first-party packs below, and not for a source your organization " +
    "allowlisted — and nothing checks for a newer version in the background. Re-running the " +
    "install line for a pack you already have re-runs every trust gate on the new content and " +
    "replaces what it landed, so re-add is the update, and it is also the only way to pick up " +
    "a change.",
};

/**
 * Every page this renderer produces, in emission order. The llms.txt index
 * reads this list rather than restating the paths, so a page can never be
 * generated without being indexed, or indexed without being generated.
 */
export const REFERENCE_PAGES: readonly ReferencePageSpec[] = [
  ...CONTENT_CLASSES.map((covers): ReferencePageSpec => {
    const page = CLASS_PAGES[covers];
    return { path: page.path, title: page.title, blurb: page.blurb, intro: page.intro, covers };
  }),
  PACKS_PAGE,
];

// ── Class pages ──────────────────────────────────────────────────

/** Inline code, for ids, tags and enum values. */
function tick(value: string): string {
  return `\`${value}\``;
}

/**
 * One artifact's block, opened by the blank line that separates it from the
 * previous one: the id as a heading, the description as the prose under it,
 * and the three remaining projected fields as a short field list. A list
 * rather than a table because a `description` and an `obsolete_when` are
 * sentences — in a table they would wrap into unreadable cells.
 */
function artifactBlock(item: CatalogItem): string[] {
  const description = requireField(item, "description", item.description);
  const load = requireField(item, "load", item.frontmatter["load"]);
  const obsoleteWhen = requireField(item, "obsolete_when", item.frontmatter["obsolete_when"]);
  if (item.tags.length === 0) {
    fail(
      `The ${item.type} "${item.id}" (${item.relativePath}) declares no \`tags\`, so it has no ` +
        `primary classification to render. Add \`tags\` to its frontmatter.`,
    );
  }
  return [
    "",
    `### ${tick(item.id)}`,
    "",
    description,
    "",
    `- **Tags:** ${item.tags.map(tick).join(", ")}`,
    `- **Load:** ${tick(load)}`,
    `- **Obsolete when:** ${obsoleteWhen}`,
  ];
}

/** Plural-aware count line; an empty class is a legitimate state, not a defect. */
function countLine(count: number, noun: string): string {
  if (count === 0) return `No ${noun}s in the corpus.`;
  return count === 1 ? `1 ${noun}.` : `${String(count)} ${noun}s.`;
}

function renderClassPage(spec: ReferencePageSpec, index: ContentIndex): string {
  const covers = spec.covers;
  // Sorted by id, not by walk order: a page whose order depends on filenames
  // reshuffles on a rename that changed nothing a reader cares about.
  const items = index.items
    .filter((item) => item.type === covers)
    .toSorted((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const lines = [
    generatedBanner(),
    "",
    `# ${spec.title}`,
    "",
    spec.intro,
    "",
    countLine(items.length, String(covers)),
    ...items.flatMap((item) => artifactBlock(item)),
  ];
  return `${lines.join("\n")}\n`;
}

// ── Pack page ────────────────────────────────────────────────────

/** One pack as the page renders it: its manifest and the content it ships. */
interface PackInventory {
  readonly manifest: PackManifest;
  readonly files: readonly PackContentFile[];
}

/**
 * Every pack directory under `packsRoot`, read through the engine's own pack
 * readers so the page and the installer agree on what a pack is. A directory
 * with no `pack.json` refuses through `readPackManifest`, whose message
 * already names the exact path — restating it here would give one defect two
 * different wordings.
 */
async function readPacks(packsRoot: string): Promise<PackInventory[]> {
  let entries;
  try {
    entries = await readdir(packsRoot, { withFileTypes: true });
  } catch (cause) {
    fail(
      `Cannot read the pack directory ${packsRoot}, so ${PACKS_PAGE.path} would claim this ` +
        `repository ships no packs. Run the generator from a source checkout. (${String(cause)})`,
    );
  }

  const dirs = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .toSorted();

  return await Promise.all(
    dirs.map(async (name): Promise<PackInventory> => {
      const packRoot = join(packsRoot, name);
      const [manifest, files] = await Promise.all([
        readPackManifest(packRoot),
        enumeratePackContent(packRoot),
      ]);
      return { manifest, files };
    }),
  );
}

/** `agents (2), skills (5)` — the classes a pack ships, with counts. */
function shippedClasses(files: readonly PackContentFile[]): string {
  const counts = new Map<string, number>();
  for (const file of files) counts.set(file.contentClass, (counts.get(file.contentClass) ?? 0) + 1);
  if (counts.size === 0) return "none — this pack ships no content";
  return [...counts]
    .map(([contentClass, count]) => `${tick(contentClass)} (${String(count)})`)
    .join(", ");
}

/**
 * The install line for one pack, chosen by whether the curated catalog carries
 * an entry for it.
 *
 * The page printed the directory form for every pack, and `add` refuses it: a
 * path-shaped spec never consults the catalog, so it resolves at the pinless
 * `pinned-unsigned` floor and the install stops on the trust gate. Every pack
 * on this page IS catalogued, so every printed line was one the binary rejects.
 *
 * The bare id is therefore the line for a catalogued pack — it resolves through
 * the catalog to the pin the entry names, which is the whole point of the
 * curated list. The directory form survives for a pack with no catalog entry,
 * where it is the only route, and it carries `--allow-untrusted` because that
 * is what the gate demands of content with no trust basis. Read from
 * `lookupCatalogEntry` rather than from a list here, so a pack entering or
 * leaving the catalog moves its own line.
 */
function installLine(packName: string): string {
  return lookupCatalogEntry(packName) === undefined
    ? `${tick(`stamity add ./${PACKS_DIR}/${packName} --allow-untrusted`)} — not in the curated ` +
        `catalog, so it has no pin to verify against and the install needs the explicit opt-in`
    : tick(`stamity add ${packName}`);
}

/** One pack's block, blank-line separated like {@link artifactBlock}. */
function packBlock(pack: PackInventory): string[] {
  const { manifest, files } = pack;
  const description = manifest.description?.trim() ?? "";
  if (description === "") {
    fail(
      `Pack "${manifest.name}" declares no \`description\` in its ${PACK_MANIFEST_FILE}, so its ` +
        `inventory entry would have nothing to say about it. Add one.`,
    );
  }
  return [
    "",
    `### ${tick(manifest.name)}`,
    "",
    description,
    "",
    `- **Version:** ${tick(manifest.version)}`,
    `- **Ships:** ${shippedClasses(files)}`,
    `- **Install:** ${installLine(manifest.name)}`,
  ];
}

function renderPacksPage(spec: ReferencePageSpec, packs: readonly PackInventory[]): string {
  const lines = [
    generatedBanner(),
    "",
    `# ${spec.title}`,
    "",
    spec.intro,
    "",
    countLine(packs.length, "pack"),
    ...packs.flatMap((pack) => packBlock(pack)),
  ];
  return `${lines.join("\n")}\n`;
}

// ── Render ───────────────────────────────────────────────────────

/** Where the renderer reads from; both default to this checkout. */
export interface ReferenceInputs {
  /** Corpus root; the package-bundled corpus when absent. */
  readonly contentRoot?: string;
  /** Directory holding the pack directories; `<packageRoot>/packs` when absent. */
  readonly packsRoot?: string;
}

/** `<packageRoot>/packs` — the packs live beside the corpus in a checkout. */
function defaultPacksRoot(): string {
  return join(findPackageRoot(dirname(fileURLToPath(import.meta.url))), PACKS_DIR);
}

/**
 * Render every reference page: repo-relative path -> page bytes, in
 * {@link REFERENCE_PAGES} order. Async because the corpus and the packs are
 * read from disk; the two reads are independent and run together.
 *
 * Throws `EngineError` (`VALIDATION_ERROR`) when an artifact is missing a
 * projected frontmatter field or a pack has no description, and propagates
 * the pack readers' own refusal for a directory with no `pack.json`.
 */
export async function renderReferencePages(
  inputs: ReferenceInputs = {},
): Promise<ReadonlyMap<string, string>> {
  const [index, packs] = await Promise.all([
    buildContentIndex(inputs.contentRoot),
    readPacks(inputs.packsRoot ?? defaultPacksRoot()),
  ]);

  const pages = new Map<string, string>();
  for (const spec of REFERENCE_PAGES) {
    pages.set(
      spec.path,
      spec.covers === "packs" ? renderPacksPage(spec, packs) : renderClassPage(spec, index),
    );
  }
  return pages;
}
