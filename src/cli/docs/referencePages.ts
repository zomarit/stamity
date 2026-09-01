/**
 * The reference pages projected from what this repository already declares:
 * one per content class from artifact frontmatter, one pack inventory, and one
 * curated MCP server catalog.
 *
 * The drift class this closes: a hand-written page listing what the
 * corpus ships is true on the day it is typed and silently false the first
 * time an artifact is added, renamed, retired, or re-tagged. Every line here
 * is a projection of a frontmatter field the catalog already parsed — id,
 * description, tags, `load`, `obsolete_when` — so the pages cannot claim an
 * artifact the corpus does not carry, or miss one it does. The MCP page is the
 * same discipline over a different source of truth: it projects
 * `src/mcp/catalog.ts`, which is what `config set mcp.servers` validates
 * against, so the accepted-value set a reader is shown and the set the binary
 * accepts cannot disagree.
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
import {
  CATALOG_VERIFIED_ON,
  CURATED_MCP_SERVERS,
  pinnedPackageSpec,
  type McpServerMeta,
} from "../../mcp/catalog.ts";
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
import {
  CONTENT_PREFIX,
  INVOCABLE_CONTENT_PREFIX,
  contentPrefixFor,
} from "../../types/markers.ts";

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

/**
 * The site frontmatter a generated page opens with, and it opens with it
 * literally: the site generator reads frontmatter only when the block starts at
 * byte 0, so a banner placed ahead of it is not "a comment before the metadata"
 * — it is the whole block going unparsed, and every page then takes its
 * navigation label from its slug instead of the title stated here.
 *
 * One home for the shape, for the same reason {@link generatedBanner} is one:
 * the sibling renderers emit it too, and a second spelling of a three-line
 * block is how one page ends up published under a label nobody chose.
 */
export function frontmatterBlock(title: string): string {
  return ["---", `title: ${title}`, "---"].join("\n");
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
  /**
   * What the page projects: a corpus class, `"packs"` for the pack inventory,
   * or `"mcp"` for the curated MCP server catalog.
   */
  readonly covers: ContentClass | "packs" | "mcp";
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
      "states the job rather than advertising the role. Authored in `content/agents/`. " +
      "Each heading is the name the agent is emitted under — the frontmatter `id` behind the " +
      `\`${CONTENT_PREFIX}\` filename prefix every non-invocable class carries — so it matches ` +
      "the artifact's filename stem in that directory rather than the bare `id:` line inside it.",
  },
  skill: {
    path: `${REFERENCE_DOC_DIR}/skills.md`,
    title: "Skills",
    blurb: "every skill in the corpus — its trigger, tags, load mode and retirement condition.",
    intro:
      "A skill is a procedure an agent runs when the work calls for it. Its `description` " +
      "is the trigger a client matches against the task at hand — it is the only part " +
      "always in context, so it carries the whole activation claim. Authored in " +
      `\`content/skills/${INVOCABLE_CONTENT_PREFIX}<id>/SKILL.md\`. Each heading is the name ` +
      "the skill is emitted and invoked under: the frontmatter `id` behind the " +
      `\`${INVOCABLE_CONTENT_PREFIX}\` prefix the invocable classes carry — the same prefix the ` +
      "path above spells out. The bare id is the `id:` line inside that `SKILL.md`.",
  },
  rule: {
    path: `${REFERENCE_DOC_DIR}/rules.md`,
    title: "Rules",
    blurb: "every rule in the corpus — its trigger, tags, load mode and retirement condition.",
    intro:
      "A rule is a constraint that binds work in this repository. `load` states when it " +
      "enters context: `always` for the floor a client must never work without, " +
      "`on-demand` for constraints scoped to files or tasks. Authored in `content/rules/`. " +
      "Each heading is the name the rule is emitted under — the frontmatter `id` behind the " +
      `\`${CONTENT_PREFIX}\` filename prefix every non-invocable class carries — so it matches ` +
      "the artifact's filename stem in that directory rather than the bare `id:` line inside it.",
  },
  command: {
    path: `${REFERENCE_DOC_DIR}/commands.md`,
    title: "Commands",
    blurb: "every command in the corpus — its trigger, tags, load mode and retirement condition.",
    intro:
      "A command is a touchpoint a human types, and each heading below is that " +
      `invocation exactly as it is typed — the \`${INVOCABLE_CONTENT_PREFIX}\` prefix, after a ` +
      "slash. The catalog files commands under a namespacing prefix of its own so one can " +
      "never shadow a skill or agent of the same name; that prefix is bookkeeping, and " +
      "nothing types it. Authored in `content/commands/`.",
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
 * The curated MCP catalog page — the accepted-value set for `mcp.servers`.
 *
 * The gap it closes: three pages sent a reader to an id they were never shown.
 * `docs/configuration.md` documents `mcp.servers` as a list of curated ids,
 * `docs/cli-reference.md` documents `config mcp add <id>`, and
 * `docs/troubleshooting.md` tells them to run it — while the ids lived only in
 * `src/mcp/catalog.ts`. Rendering them here rather than typing them out is what
 * keeps the published set and the set `config set` validates against identical:
 * the table IS the validator's table.
 *
 * The prose lives in the generator for the same reason the pack page's does —
 * the committed page is byte-compared against this render, so a fact typed into
 * the file is erased by the next regeneration.
 */
const MCP_PAGE: ReferencePageSpec = {
  path: `${REFERENCE_DOC_DIR}/mcp-servers.md`,
  title: "MCP servers",
  covers: "mcp",
  blurb:
    "every curated MCP server id `mcp.servers` accepts, with its pin, credentials and blast radius.",
  intro:
    "An MCP server is a tool endpoint a client launches beside the agent. The ids below are what " +
    "`stamity config set mcp.servers` and `stamity config mcp add <id>` accept, and this is the " +
    "whole curated set — any other id resolves only when an installed pack supplies it. A pack " +
    "may ADD a server under a new id and can never redefine one of these: a curated id always " +
    "resolves to its reviewed row, so a pack claiming one is refused at install rather than " +
    "merged.\n\n" +
    "**Two ways a server runs, and each row says which.** A local child process runs with the " +
    "editor's own privileges — no authentication and no encryption between the two, and the " +
    "absence of a URL is not a security property. A remote endpoint is reached over TLS, but " +
    "through a bridge process launched on the same machine, and that bridge sees every " +
    "request.\n\n" +
    "**Every row pins an exact version.** npm forbids republishing a version with different " +
    "bytes, so an exact pin is effectively content-addressed — a maintainer cannot reach a " +
    "pinned consumer without a reviewable version bump. What a pin cannot give you is currency: " +
    "a version that was clean on the day it was read stays byte-identical while the world learns " +
    "it is vulnerable. That is why two dates appear below and mean different things. The sweep " +
    "date covers the row SET — every row present, every row still wanted — and each row " +
    "carries the day its own version was last read off its upstream. Reading the first as pin " +
    "freshness is the specific misreading the split exists to prevent.\n\n" +
    "**No credential is written into a client config.** A row names the variables it needs, the " +
    "emitted config carries a reference to each, and the literal values live in `.env.mcp` — " +
    "gitignored, created private to the operator, and never committed. `stamity config mcp add " +
    "<id>` writes the variable names that server needs into that file, with the value left blank " +
    "for you to fill in.",
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
  MCP_PAGE,
];

// ── Class pages ──────────────────────────────────────────────────

/** Inline code, for ids, tags and enum values. */
function tick(value: string): string {
  return `\`${value}\``;
}

/**
 * The heading spelling for one artifact: what an operator invokes it by, not
 * what the catalog files it under.
 *
 * The two differ in exactly the places a reader notices. A command's catalog id
 * carries {@link COMMAND_ID_PREFIX} so it cannot shadow a skill or an agent of
 * the same name — internal bookkeeping that nobody types — and every class then
 * takes the filename prefix its emission earns. So the page headed a touchpoint
 * `cmd-work` while its own intro said the typed form drops that prefix; the
 * reader was left to work out which of the two the client would accept.
 *
 * Which prefix a class earns is {@link contentPrefixFor}'s answer, not one
 * re-decided here — the same call the adapters make, so the page and the file
 * an install lands cannot disagree about the spelling. The leading slash is the
 * command half of that: a command is typed after one, so the heading shows it.
 * The already-prefixed guard means an id authored with its prefix already on it
 * renders once rather than doubled.
 */
function invokedName(item: CatalogItem): string {
  const bare =
    item.type === "command" && item.id.startsWith(COMMAND_ID_PREFIX)
      ? item.id.slice(COMMAND_ID_PREFIX.length)
      : item.id;
  const prefix = contentPrefixFor(item);
  const spelled = bare.startsWith(prefix) ? bare : `${prefix}${bare}`;
  return item.type === "command" ? `/${spelled}` : spelled;
}

/**
 * One artifact's block, opened by the blank line that separates it from the
 * previous one: the {@link invokedName} heading, the description as the prose
 * under it, and the three remaining projected fields as a short field list. A
 * list rather than a table because a `description` and an `obsolete_when` are
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
    `### ${tick(invokedName(item))}`,
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
    frontmatterBlock(spec.title),
    "",
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
    frontmatterBlock(spec.title),
    "",
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

// ── MCP catalog page ─────────────────────────────────────────────

/**
 * How each transport is named on a row. The enum value is not rendered, and
 * that is the point twice over: `stdio` tells a reader nothing about the
 * privileges they are handing out, and the other literal is a token the lane's
 * links-nothing-outside-the-tree gate reads as a URL. What each of these means
 * is stated once in the page intro rather than eight times down the page.
 *
 * Total over the transport union on purpose: a third transport fails to compile
 * here rather than rendering as a blank clause.
 */
const TRANSPORT_LABEL: Record<McpServerMeta["transport"], string> = {
  stdio: "a local child process",
  http: "a remote endpoint, through a bridge launched locally",
};

/** A catalog string that must be present for the row to say anything. */
function requireServerField(id: string, field: string, value: string | undefined): string {
  if (value === undefined || value.trim() === "") {
    fail(
      `The curated MCP server "${id}" declares no \`${field}\`, so its catalog entry would ` +
        `render an empty ${field}. Add \`${field}\` to its row in src/mcp/catalog.ts.`,
    );
  }
  return value.trim().replace(/\s*\r?\n\s*/g, " ");
}

/**
 * The pin line, split by how the launcher gets its bytes. A fetch launcher
 * carries the exact package token in its own argument vector, so that is what
 * the reader is shown; a host-installed launcher's version lives on the
 * operator's machine, and printing a pin for it would claim a guarantee this
 * catalog cannot make. {@link pinnedPackageSpec} decides which — the same call
 * emission makes, so the page and the refusal agree about what is pinned.
 */
function pinLine(server: McpServerMeta): string {
  const reviewed = requireServerField(server.id, "pinReviewedOn", server.pinReviewedOn);
  const spec = pinnedPackageSpec(server);
  const version = tick(server.pinnedVersion);
  const launcher = tick(server.command);
  return spec === undefined
    ? `${launcher} — a launcher you install yourself, so its version is yours to keep current; ` +
        `this row is verified against ${version}, read on ${tick(reviewed)}`
    : `${tick(spec)}, fetched by ${launcher} at every launch — read off its registry on ` +
        `${tick(reviewed)}`;
}

/** The variables the operator supplies before the server starts. */
function credentialLine(server: McpServerMeta): string {
  const required = server.requiresEnv ?? [];
  if (required.length === 0) return "none — this server holds no credential";
  return required
    .map((variable) => `${tick(variable.name)} (${variable.comment.trim()})`)
    .join(", ");
}

/** One server's block, blank-line separated like {@link artifactBlock}. */
function serverBlock(server: McpServerMeta): string[] {
  return [
    "",
    `### ${tick(server.id)}`,
    "",
    requireServerField(server.id, "description", server.description),
    "",
    `- **Runs as:** ${TRANSPORT_LABEL[server.transport]}`,
    `- **Published by:** ${
      server.firstParty
        ? "the vendor of the service it fronts"
        : "a community re-implementation, held to the same pin discipline"
    }`,
    `- **Pin:** ${pinLine(server)}`,
    `- **Credentials:** ${credentialLine(server)}`,
    `- **Blast radius:** ${requireServerField(server.id, "blastRadius", server.blastRadius)}`,
  ];
}

/**
 * Render the catalog page from an explicit table, so the refusals above are
 * reachable from a test without a defective checkout.
 *
 * Rows keep the catalog's DECLARATION order rather than sorting by id, and that
 * is the one place this page departs from its siblings. A class page sorts
 * because its walk order is filenames, which carry no meaning; this table's
 * order is itself curated — systems-of-record first, then general-purpose, then
 * the ones that reach production data, roughly ascending blast radius within
 * each group — so sorting it would discard a fact the source states. Insertion
 * order over string keys is stable, so the render stays byte-identical.
 *
 * Throws `EngineError` (`VALIDATION_ERROR`) on a row missing a description, a
 * blast radius, or its own pin-review date.
 */
export function renderMcpPageFrom(
  servers: Readonly<Record<string, McpServerMeta>>,
  verifiedOn: string,
  spec: ReferencePageSpec = MCP_PAGE,
): string {
  const rows = Object.values(servers);
  // Two states this page must not render past. An empty table would publish an
  // accepted-value set of nothing while `config set mcp.servers` still resolves
  // curated ids — and {@link countLine}'s empty phrasing says "in the corpus",
  // which this table is not part of. A blank sweep date would print an empty
  // code span where the currency claim goes, which reads as no claim at all.
  if (rows.length === 0) {
    fail(
      `The curated MCP catalog is empty, so ${MCP_PAGE.path} would publish an accepted-value set ` +
        `of nothing. Check \`CURATED_MCP_SERVERS\` in src/mcp/catalog.ts.`,
    );
  }
  if (verifiedOn.trim() === "") {
    fail(
      `The curated MCP catalog states no sweep date, so ${MCP_PAGE.path} would publish its row ` +
        `set with no currency claim. Check \`CATALOG_VERIFIED_ON\` in src/mcp/catalog.ts.`,
    );
  }

  const lines = [
    frontmatterBlock(spec.title),
    "",
    generatedBanner(),
    "",
    `# ${spec.title}`,
    "",
    spec.intro,
    "",
    `${countLine(rows.length, "server")} Row set last swept on ${tick(verifiedOn)}.`,
    ...rows.flatMap((server) => serverBlock(server)),
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
    if (spec.covers === "packs") pages.set(spec.path, renderPacksPage(spec, packs));
    else if (spec.covers === "mcp") {
      pages.set(spec.path, renderMcpPageFrom(CURATED_MCP_SERVERS, CATALOG_VERIFIED_ON, spec));
    } else pages.set(spec.path, renderClassPage(spec, index));
  }
  return pages;
}
