import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import {
  REFERENCE_PAGES,
  REGENERATE_COMMAND,
  frontmatterBlock,
  generatedBanner,
  renderMcpPageFrom,
  renderReferencePages,
} from "../../../src/cli/docs/referencePages.ts";
import {
  CATALOG_VERIFIED_ON,
  CURATED_MCP_SERVERS,
  pinnedPackageSpec,
  type McpServerMeta,
} from "../../../src/mcp/catalog.ts";
import {
  COMMAND_ID_PREFIX,
  buildContentIndex,
  type CatalogItem,
} from "../../../src/content/catalog.ts";
import { lookupCatalogEntry } from "../../../src/pack/curated.ts";
import { CONTENT_CLASSES } from "../../../src/types/content.ts";
import { EngineError } from "../../../src/types/errors.ts";

/**
 * The drift gate on the per-class reference pages.
 *
 * Each page is a projection of artifact frontmatter, so an artifact added,
 * retired, re-tagged, or re-described has to show up as a byte diff. The
 * refusal cases run against seeded corpora on disk rather than the real one:
 * the corpus frontmatter contract already forbids the defects, so the only
 * way to prove this renderer catches them is to build a corpus that has them.
 */

const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const MODULE_SOURCE_PATH = join(REPO_ROOT, "src/cli/docs/referencePages.ts");
const SCRIPT_PATH = join(REPO_ROOT, "scripts/generate-docs.mjs");
const REAL_PACKS_ROOT = join(REPO_ROOT, "packs");

const staleMessage = (page: string): string =>
  `${page} is stale — the render no longer matches the committed page. ` +
  `Regenerate it with \`${REGENERATE_COMMAND}\` and commit the diff.`;

const committed = (relPath: string): string => readFileSync(join(REPO_ROOT, relPath), "utf-8");

const live = async (): Promise<ReadonlyMap<string, string>> => await renderReferencePages();

/** A valid artifact body; every defect case removes exactly one field from it. */
function artifact(fields: Record<string, string>): string {
  const front = Object.entries(fields)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");
  return `---\n${front}\n---\n\n# body\n\nBody text.\n`;
}

const VALID_AGENT: Record<string, string> = {
  id: "probe",
  type: "agent",
  description: "Does one probing job.",
  tags: "[implementation]",
  load: "on-demand",
  obsolete_when: "clients probe unprompted",
};

/** A seeded corpus + packs root, torn down by the caller. */
async function seed(
  agentFields: Record<string, string>,
  options: { readonly packJson?: string | null } = {},
): Promise<{ contentRoot: string; packsRoot: string; cleanup: () => void }> {
  const dir = mkdtempSync(join(tmpdir(), "stamity-p6u03-corpus-"));
  const contentRoot = join(dir, "content");
  const packsRoot = join(dir, "packs");
  const agentPath = join(contentRoot, "agents", "stamity-probe.md");
  await mkdir(dirname(agentPath), { recursive: true });
  await writeFile(agentPath, artifact(agentFields), "utf-8");

  await mkdir(join(packsRoot, "probe-pack"), { recursive: true });
  if (options.packJson !== null) {
    await writeFile(
      join(packsRoot, "probe-pack", "pack.json"),
      options.packJson ??
        JSON.stringify({
          name: "probe-pack",
          version: "0.0.1",
          description: "A probe pack.",
          integrity: {},
        }),
      "utf-8",
    );
  }
  return { contentRoot, packsRoot, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

describe("renderReferencePages — drift gate", () => {
  it("byte-matches every committed page", async () => {
    const pages = await live();
    expect([...pages.keys()]).toEqual(REFERENCE_PAGES.map((page) => page.path));
    for (const [path, bytes] of pages) {
      expect(bytes, staleMessage(path)).toBe(committed(path));
    }
  });

  it("opens every page with its frontmatter title, then the generated banner", async () => {
    // Changed assertion (not a weakening): the banner used to be the first bytes
    // of every page, and Docusaurus parses frontmatter ONLY at byte 0 — so a
    // banner ahead of it made the whole block invisible and every sidebar label
    // was derived from the page slug instead of its title. The contract moved:
    // frontmatter first, banner immediately after it, both still asserted here.
    for (const [path, bytes] of await live()) {
      const title = REFERENCE_PAGES.find((page) => page.path === path)?.title ?? "";
      expect(title, `${path} has no page spec to take a title from`).not.toBe("");
      expect(bytes.startsWith(`${frontmatterBlock(title)}\n\n${generatedBanner()}\n`)).toBe(true);
      expect(bytes.indexOf("---"), `${path} does not open with frontmatter`).toBe(0);
      expect(bytes).toContain(`title: ${title}`);
      expect(bytes).toContain(REGENERATE_COMMAND);
    }
  });

  it("ends every page with exactly one trailing newline and no CR", async () => {
    for (const bytes of (await live()).values()) {
      expect(bytes.endsWith("\n")).toBe(true);
      expect(bytes.endsWith("\n\n")).toBe(false);
      expect(bytes).not.toContain("\r");
    }
  });

  it("renders byte-identically twice", async () => {
    const [first, second] = await Promise.all([live(), live()]);
    expect([...second]).toEqual([...first]);
  });

  it("reads no clock", () => {
    const source = readFileSync(MODULE_SOURCE_PATH, "utf-8");
    expect(source).not.toMatch(/\bnew Date\b/);
    expect(source).not.toMatch(/\bDate\.(now|UTC|parse)\(/);
    expect(source).not.toMatch(/toISOString\(/);
  });

  it("links nothing outside the tree", async () => {
    for (const [path, bytes] of await live()) {
      expect(bytes, `${path} carries an absolute URL`).not.toContain("http");
      expect(bytes).not.toMatch(/[a-z][a-z0-9+.-]*:\/\//i);
    }
  });

  it("covers every content class with a page, plus the pack and MCP inventories", () => {
    // Changed expectation (not a weakening): the lane grew a third projection —
    // the curated MCP catalog — so the list it is held to grew by exactly that
    // one entry. The claim is unchanged: REFERENCE_PAGES is the complete,
    // ordered set of pages this renderer produces, and a page added without a
    // row here fails rather than shipping unlisted.
    expect(REFERENCE_PAGES.map((page) => page.covers)).toEqual([
      ...CONTENT_CLASSES,
      "packs",
      "mcp",
    ]);
  });
});

/**
 * The spelling a reader invokes an artifact by: `/st-work`, `st-verify`,
 * `stamity-creator`. Written out here rather than imported from the renderer, so
 * the assertion below is an independent claim about the page rather than a
 * mirror of the code that produced it.
 */
const invoked = (item: CatalogItem): string => {
  if (item.type === "command") return `/st-${item.id.replace(/^cmd-/, "")}`;
  return item.type === "skill" ? `st-${item.id}` : `stamity-${item.id}`;
};

describe("frontmatter projection", () => {
  it("puts every corpus artifact on its class page exactly once, in id order", async () => {
    const [pages, index] = await Promise.all([live(), buildContentIndex()]);
    for (const spec of REFERENCE_PAGES) {
      // The two pages that project something other than corpus frontmatter.
      if (spec.covers === "packs" || spec.covers === "mcp") continue;
      const page = pages.get(spec.path) ?? "";
      // Changed expectation (not a weakening): the headings were the raw catalog
      // ids and are now the invoked spellings, because a reader who types
      // `/st-work` was being shown `cmd-work`. Same set, same order, same
      // one-entry-per-artifact claim — only the rendering of each id moved.
      const expected = index.items
        .filter((item) => item.type === spec.covers)
        .toSorted((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
        .map(invoked);
      const headings = page
        .split("\n")
        .filter((line) => line.startsWith("### "))
        .map((line) => line.slice(5, -1));
      expect(headings, `${spec.path} artifact set`).toEqual(expected);
      expect(page).toContain(`${String(expected.length)} ${String(spec.covers)}s.`);
    }
  });

  it("projects description, tags, load and obsolete_when verbatim", async () => {
    const [pages, index] = await Promise.all([live(), buildContentIndex()]);
    const pageFor = (item: CatalogItem): string =>
      pages.get(REFERENCE_PAGES.find((page) => page.covers === item.type)?.path ?? "") ?? "";

    for (const item of index.items) {
      const page = pageFor(item);
      expect(page, `${item.id} description`).toContain(item.description);
      expect(page).toContain(`- **Tags:** ${item.tags.map((tag) => `\`${tag}\``).join(", ")}`);
      expect(page).toContain(`- **Load:** \`${String(item.frontmatter["load"])}\``);
      expect(page).toContain(`- **Obsolete when:** ${String(item.frontmatter["obsolete_when"])}`);
    }
  });

  it("never restates a body — only the frontmatter projection reaches the page", async () => {
    const [pages, index] = await Promise.all([live(), buildContentIndex()]);
    const agents = pages.get("docs/reference/agents.md") ?? "";
    for (const item of index.items.filter((entry) => entry.type === "agent")) {
      // A body's first heading line would be the giveaway if bodies leaked.
      const bodyHeading = item.body.split("\n").find((line) => line.startsWith("## "));
      if (bodyHeading !== undefined) expect(agents).not.toContain(bodyHeading);
    }
  });

  it("heads a command with the touchpoint a human types, and shows the catalog id nowhere", async () => {
    // Inverted assertion (not a weakening): this used to REQUIRE `### `cmd-` on
    // the commands page. That heading is the catalog's internal namespacing, not
    // anything a reader types, and it contradicted the page's own prose one line
    // above it. The contract moved to "the internal id appears nowhere
    // reader-facing", so the old requirement becomes its own regression case,
    // asserted across every page rather than only the one that showed it.
    const pages = await live();
    const commands = pages.get("docs/reference/commands.md") ?? "";
    expect(commands).toContain("### `/st-work`");
    expect(commands).toMatch(/^### `\/st-[a-z][a-z-]*`$/m);
    for (const [path, bytes] of pages) {
      expect(bytes, `${path} shows the catalog-internal command id prefix`).not.toContain(
        COMMAND_ID_PREFIX,
      );
    }
  });
});

describe("pack inventory", () => {
  it("lists every first-party pack with its version and an install line the binary accepts", async () => {
    const packs = (await live()).get("docs/reference/packs.md") ?? "";
    for (const id of ["ops", "product-audit", "scaffold"]) {
      expect(packs, `packs page omits ${id}`).toContain(`### \`${id}\``);
      // Changed line (not a weakening): the page printed
      // `stamity add ./packs/<id>` for all three, and `add` REFUSES that — a
      // path-shaped spec never consults the catalog, so it resolves at the
      // pinless floor and the trust gate stops it. All three are catalogued, so
      // the bare id is the line that resolves to their pin. The pack IS in the
      // catalog, asserted directly so this is not just a string swap.
      expect(lookupCatalogEntry(id), `${id} is not in the curated catalog`).toBeDefined();
      expect(packs).toContain(`- **Install:** \`stamity add ${id}\``);
      expect(packs).not.toContain(`stamity add ./packs/${id}\``);
    }
    expect(packs).toContain("3 packs.");
    expect(packs).toMatch(/- \*\*Ships:\*\* `agents` \(\d+\)/);
  });

  it("renders the directory form with --allow-untrusted for an uncatalogued pack", async () => {
    // The other branch, on a pack the catalog does not carry: the directory
    // form is then the only route, and it needs the explicit opt-in because
    // there is no pin to verify the content against.
    const fixture = await seed(VALID_AGENT);
    try {
      const pages = await renderReferencePages({
        contentRoot: fixture.contentRoot,
        packsRoot: fixture.packsRoot,
      });
      const packs = pages.get("docs/reference/packs.md") ?? "";

      expect(lookupCatalogEntry("probe-pack")).toBeUndefined();
      expect(packs).toContain("`stamity add ./packs/probe-pack --allow-untrusted`");
      expect(packs).toContain("no pin to verify against");
    } finally {
      fixture.cleanup();
    }
  });

  it("states that re-add is the only update route, from the generator and not from page bytes", async () => {
    // No pack source has an auto-update path — not the first-party
    // packs, not an org-allowlisted source — and nothing told an operator that
    // re-adding IS the update. The sentence has to live in the generator: the
    // page is byte-compared against this render, so a fact typed into the
    // committed file is erased by the next regeneration.
    const intro = REFERENCE_PAGES.find((page) => page.covers === "packs")?.intro ?? "";
    expect(intro).toContain("Updating a pack means adding it again");
    expect(intro).toContain("no auto-update path");
    expect(intro).toContain("allowlisted");

    const packs = (await live()).get("docs/reference/packs.md") ?? "";
    expect(packs).toContain(intro);
  });

  it("refuses a pack directory with no pack.json, naming the path", async () => {
    const fixture = await seed(VALID_AGENT, { packJson: null });
    try {
      await expect(
        renderReferencePages({ contentRoot: fixture.contentRoot, packsRoot: fixture.packsRoot }),
      ).rejects.toThrowError(/probe-pack[\\/]pack\.json/);
    } finally {
      fixture.cleanup();
    }
  });

  it("refuses a pack whose manifest declares no description, naming the pack", async () => {
    const fixture = await seed(VALID_AGENT, {
      packJson: JSON.stringify({ name: "probe-pack", version: "0.0.1", integrity: {} }),
    });
    try {
      await expect(
        renderReferencePages({ contentRoot: fixture.contentRoot, packsRoot: fixture.packsRoot }),
      ).rejects.toThrowError(/"probe-pack" declares no `description`/);
    } finally {
      fixture.cleanup();
    }
  });

  it("refuses a missing packs directory rather than claiming there are none", async () => {
    await expect(
      renderReferencePages({ packsRoot: join(tmpdir(), "stamity-p6u03-absent-packs") }),
    ).rejects.toThrowError(/Cannot read the pack directory/);
  });
});

/**
 * The MCP catalog page: the operator-facing accepted-value set for
 * `mcp.servers`.
 *
 * Three pages sent a reader to an id nothing published — `docs/configuration.md`
 * calls the value set "curated", `docs/cli-reference.md` documents
 * `config mcp add <id>`, `docs/troubleshooting.md` tells them to run it — while
 * the ids lived only in `src/mcp/catalog.ts`. The claim these cases hold is that
 * the published set IS that table, rather than a copy of it that can drift.
 */
describe("MCP catalog page", () => {
  const MCP_PATH = "docs/reference/mcp-servers.md";

  /**
   * A valid curated row; every defect case below blanks exactly one field.
   * `docsUrl` is empty because the page never renders it — this lane's
   * links-nothing-outside-the-tree gate is what keeps every URL off these
   * pages, so a fixture carrying one would only be able to prove that.
   */
  const PROBE_SERVER: McpServerMeta = {
    id: "probe",
    description: "A probing server.",
    command: "npx",
    args: ["-y", "probe-mcp@1.0.0"],
    transport: "stdio",
    pinnedVersion: "1.0.0",
    pinReviewedOn: "2026-01-02",
    packageNameLock: "probe-mcp",
    firstParty: true,
    blastRadius: "Low — a probe.",
    docsUrl: "",
  };

  const probeWith = (patch: Partial<McpServerMeta> = {}): Record<string, McpServerMeta> => ({
    probe: { ...PROBE_SERVER, ...patch },
  });

  /** The three row fields whose absence the page refuses to paper over. */
  const BLANKABLE: readonly (readonly [string, Partial<McpServerMeta>])[] = [
    ["description", { description: "  " }],
    ["blastRadius", { blastRadius: "  " }],
    ["pinReviewedOn", { pinReviewedOn: "  " }],
  ];

  it("publishes every curated id and no other, so the page is the accepted-value set", async () => {
    const page = (await live()).get(MCP_PATH) ?? "";
    const headings = page
      .split("\n")
      .filter((line) => line.startsWith("### "))
      .map((line) => line.slice(5, -1));

    expect(headings).toEqual(Object.keys(CURATED_MCP_SERVERS));
    expect(headings.length).toBeGreaterThan(1);
    expect(page).toContain(`${String(headings.length)} servers.`);
  });

  it("keeps the catalog's own curated order rather than sorting by id", () => {
    // The one page in this lane that does NOT sort: the table's order is a
    // curated fact (systems-of-record first, ascending blast radius within a
    // group), so sorting it would discard something the source states. The
    // guard is that the two orders actually differ — on a table that happened
    // to be alphabetical this case would pass while asserting nothing.
    const declared = Object.keys(CURATED_MCP_SERVERS);
    expect(declared).not.toEqual([...declared].toSorted());
  });

  it("renders each row's pin from the launcher table emission uses", async () => {
    const page = (await live()).get(MCP_PATH) ?? "";
    for (const server of Object.values(CURATED_MCP_SERVERS)) {
      const spec = pinnedPackageSpec(server);
      if (spec === undefined) {
        // A host-installed launcher: the version lives on the operator's
        // machine, so the page states what the row is verified against instead
        // of claiming a pin this catalog cannot hold.
        expect(page, `${server.id} pin`).toContain(
          `\`${server.command}\` — a launcher you install yourself`,
        );
        expect(page).toContain(`verified against \`${server.pinnedVersion}\``);
      } else {
        expect(page, `${server.id} pin`).toContain(`- **Pin:** \`${spec}\`, fetched by`);
      }
    }
  });

  it("keeps the sweep date and the per-row pin dates as two separate claims", async () => {
    const page = (await live()).get(MCP_PATH) ?? "";
    expect(page).toContain(`Row set last swept on \`${CATALOG_VERIFIED_ON}\``);
    for (const server of Object.values(CURATED_MCP_SERVERS)) {
      expect(server.pinReviewedOn, `${server.id} carries no pin-review date`).toBeDefined();
    }
    // A page carrying one date for both readings is exactly the false green the
    // catalog's two-date split exists to prevent, so the prose has to say which
    // is which.
    expect(page).toContain("Reading the first as pin freshness");
  });

  it("names the variables a server needs, and says so when it needs none", async () => {
    const page = (await live()).get(MCP_PATH) ?? "";
    for (const server of Object.values(CURATED_MCP_SERVERS)) {
      for (const variable of server.requiresEnv ?? []) {
        expect(page, `${server.id} omits ${variable.name}`).toContain(`\`${variable.name}\``);
        expect(page).toContain(variable.comment);
      }
    }
    const credentialless = Object.values(CURATED_MCP_SERVERS).filter(
      (server) => (server.requiresEnv ?? []).length === 0,
    );
    expect(
      credentialless.length,
      "no credential-free row to check the other branch on",
    ).toBeGreaterThan(0);
    expect(page).toContain("- **Credentials:** none — this server holds no credential");
  });

  it("states that a pack can add a server but never redefine a curated id", async () => {
    // The security property the catalog resolves by, published where the
    // operator chooses a value: a curated id always resolves to its reviewed
    // row, so pack supply widens the set and never redirects it.
    const page = (await live()).get(MCP_PATH) ?? "";
    expect(page).toContain("can never redefine one of these");
    expect(page).toContain("refused at install");
  });

  it("keeps credentials out of the emitted config and names the file they live in", async () => {
    const page = (await live()).get(MCP_PATH) ?? "";
    expect(page).toContain("`.env.mcp`");
    expect(page).toContain("No credential is written into a client config");
  });

  it.each(BLANKABLE)("refuses a curated row with no %s, naming the server and the field", (field, patch) => {
    const call = (): string => renderMcpPageFrom(probeWith(patch), "2026-01-01");
    expect(call).toThrowError(EngineError);
    expect(call).toThrowError(/"probe"/);
    expect(call).toThrowError(new RegExp(`\`${field}\``));
    expect(call).toThrowError(/src\/mcp\/catalog\.ts/);
  });

  it("renders a well-formed probe row, so the cases above isolate one defect each", () => {
    const page = renderMcpPageFrom(probeWith(), "2026-01-01");
    expect(page).toContain("### `probe`");
    expect(page).toContain("1 server. Row set last swept on `2026-01-01`.");
    expect(page).toContain("- **Runs as:** a local child process");
    expect(page).toContain("- **Published by:** the vendor of the service it fronts");
  });

  it("marks a community row as a re-implementation rather than vendor-published", () => {
    const page = renderMcpPageFrom(probeWith({ firstParty: false }), "2026-01-01");
    expect(page).toContain("- **Published by:** a community re-implementation");
  });

  it("refuses an empty catalog rather than publishing a set of nothing", () => {
    // `config set mcp.servers` still resolves curated ids, so a page claiming
    // there are none would be false rather than merely empty — and the shared
    // count line's empty phrasing says "in the corpus", which this table is not
    // part of.
    const emptyCatalog: Record<string, McpServerMeta> = {};
    const call = (): string => renderMcpPageFrom(emptyCatalog, "2026-01-01");
    expect(call).toThrowError(EngineError);
    expect(call).toThrowError(/accepted-value set of nothing/);
    expect(call).toThrowError(/CURATED_MCP_SERVERS/);
  });

  it("refuses a blank sweep date rather than printing an empty currency claim", () => {
    const call = (): string => renderMcpPageFrom(probeWith(), "   ");
    expect(call).toThrowError(EngineError);
    expect(call).toThrowError(/no currency claim/);
    expect(call).toThrowError(/CATALOG_VERIFIED_ON/);
  });

  it("classifies the refusal as VALIDATION_ERROR", () => {
    try {
      renderMcpPageFrom(probeWith({ description: "" }), "2026-01-01");
      expect.unreachable("a description-less server row must refuse");
    } catch (err) {
      expect((err as EngineError).code).toBe("VALIDATION_ERROR");
    }
  });
});

describe("refuse-to-render on a defective artifact", () => {
  const omit = (field: string): Record<string, string> => {
    const copy = { ...VALID_AGENT };
    delete copy[field];
    return copy;
  };

  it.each([
    ["description", "description"],
    ["obsolete_when", "obsolete_when"],
    ["load", "load"],
    ["tags", "tags"],
  ])("refuses an artifact with no %s, naming the artifact and its path", async (field) => {
    const fixture = await seed(omit(field));
    try {
      const call = renderReferencePages({
        contentRoot: fixture.contentRoot,
        packsRoot: fixture.packsRoot,
      });
      await expect(call).rejects.toThrowError(EngineError);
      await expect(call).rejects.toThrowError(/"probe"/);
      await expect(call).rejects.toThrowError(new RegExp(`\`${field}\``));
      await expect(call).rejects.toThrowError(/agents\/stamity-probe\.md/);
    } finally {
      fixture.cleanup();
    }
  });

  it("treats a blank value the same as a missing one", async () => {
    const fixture = await seed({ ...VALID_AGENT, obsolete_when: '"   "' });
    try {
      await expect(
        renderReferencePages({ contentRoot: fixture.contentRoot, packsRoot: fixture.packsRoot }),
      ).rejects.toThrowError(/`obsolete_when`/);
    } finally {
      fixture.cleanup();
    }
  });

  it("classifies the refusal as VALIDATION_ERROR", async () => {
    const fixture = await seed(omit("description"));
    try {
      await renderReferencePages({
        contentRoot: fixture.contentRoot,
        packsRoot: fixture.packsRoot,
      });
      expect.unreachable("a description-less artifact must refuse");
    } catch (err) {
      expect((err as EngineError).code).toBe("VALIDATION_ERROR");
    } finally {
      fixture.cleanup();
    }
  });

  it("renders a well-formed seeded corpus, so the cases above isolate one defect each", async () => {
    const fixture = await seed(VALID_AGENT);
    try {
      const pages = await renderReferencePages({
        contentRoot: fixture.contentRoot,
        packsRoot: fixture.packsRoot,
      });
      const agents = pages.get("docs/reference/agents.md") ?? "";
      // Changed expectation (not a weakening): headings render the invoked
      // spelling now, and an agent with the frontmatter id `probe` is invoked as
      // `stamity-probe`. The claim — this artifact reached its class page — is
      // the same one, held to the spelling the page actually ships.
      expect(agents).toContain("### `stamity-probe`");
      expect(agents).toContain("1 agent.");
      expect(pages.get("docs/reference/packs.md") ?? "").toContain("### `probe-pack`");
      // An empty class is a legitimate state, not a defect.
      expect(pages.get("docs/reference/rules.md") ?? "").toContain("No rules in the corpus.");
    } finally {
      fixture.cleanup();
    }
  });
});

describe("scripts/generate-docs.mjs --page reference", () => {
  const workspace = mkdtempSync(join(tmpdir(), "stamity-p6u03-ref-"));
  afterAll(() => rmSync(workspace, { recursive: true, force: true }));

  it("writes every page, and a second run produces zero diff", async () => {
    const run = (): Map<string, string> => {
      execFileSync(process.execPath, [SCRIPT_PATH, "--page", "reference", "--out-dir", workspace], {
        encoding: "utf-8",
      });
      return new Map(
        REFERENCE_PAGES.map((page) => [
          page.path,
          readFileSync(join(workspace, page.path), "utf-8"),
        ]),
      );
    };
    const expected = await live();
    const first = run();
    expect([...first]).toEqual([...expected]);
    expect([...run()]).toEqual([...first]);
  });

  it("reads the real packs root by default", () => {
    expect(readFileSync(join(workspace, "docs/reference/packs.md"), "utf-8")).toContain(
      "### `ops`",
    );
    expect(REAL_PACKS_ROOT.endsWith("packs")).toBe(true);
  });
});
