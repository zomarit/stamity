import { describe, expect, it } from "vitest";

/**
 * The docs site's header-cell association, checked where it is decided.
 *
 * The site has no test runner of its own — `website/package.json` carries `build`, `start`,
 * `serve`, `clear` and `typecheck`, and nothing else — so this suite is where a plugin of its
 * own writing gets proved. The plugin is deliberately dependency-free (it declares the slice of
 * hast it reads, the way `website/src/remark/repoLinks.ts` declares its link node), so importing
 * it here pulls in nothing from `website/node_modules`, which this runner never installs.
 *
 * What is under test is an accessibility floor, not a preference: a `th` with no `scope` heads
 * nothing a screen reader can attach a value to (WCAG 1.3.1), and it is the QA harness's
 * accessibility-tree row that measures it cell by cell. The trees below are the shapes the
 * renderer produces and the shapes raw HTML in a page could produce — including the one cell the
 * plugin refuses to guess at, which is asserted as a non-decision rather than left unstated.
 */

interface HastNode {
  type: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
}

/**
 * The plugin under test, loaded by URL rather than through a static import.
 *
 * `website/` declares no `"type": "module"` and cannot: Docusaurus loads `docusaurus.config.ts`
 * as CommonJS, which is the reason that config's own `SITE_DIR` reads `__dirname`. So the root
 * `tsc --noEmit` — `module: nodenext`, which decides a file's format from the nearest
 * package.json — reads every `.ts` under `website/` as CommonJS and rejects its `export default`
 * under `verbatimModuleSyntax` (TS1287). The file is correct where it is compiled, by the site's
 * own `tsc` and by its webpack build; it is the ROOT program that cannot hold it, and the
 * "fix" that would let it — a `"type"` key in the site's package.json — would break the config
 * load. Loading by URL keeps the module out of the root type program while the assertions below
 * still run against the real file rather than a copy that could drift from it.
 */
const PLUGIN_URL = new URL("../../website/src/rehype/tableHeaderScope.ts", import.meta.url).href;
const tableHeaderScope = (
  (await import(/* @vite-ignore */ PLUGIN_URL)) as { default: () => (tree: HastNode) => void }
).default;

/** An element node, spelled the way hast spells it. */
function element(tagName: string, children: HastNode[], properties?: Record<string, unknown>): HastNode {
  return { type: "element", tagName, properties: properties ?? {}, children };
}

/** A cell with text in it: a header cell is never empty in the pages this runs over. */
function cell(tagName: string, text: string, properties?: Record<string, unknown>): HastNode {
  return element(tagName, [{ type: "text" }], { ...properties, "data-text": text });
}

/** Run the plugin over a tree, in place, and hand the tree back. */
function run(tree: HastNode): HastNode {
  tableHeaderScope()(tree);
  return tree;
}

/** Every `th` in a tree, in document order, as `text -> scope` (`null` where none was set). */
function headerScopes(tree: HastNode): Array<[string, unknown]> {
  const found: Array<[string, unknown]> = [];
  const walk = (node: HastNode): void => {
    if (node.type === "element" && node.tagName === "th") {
      found.push([String(node.properties?.["data-text"]), node.properties?.scope ?? null]);
    }
    for (const child of node.children ?? []) walk(child);
  };
  walk(tree);
  return found;
}

/** The shape every markdown table renders as: one `thead` row of headers over a `tbody`. */
function markdownTable(): HastNode {
  return element("table", [
    element("thead", [
      element("tr", [cell("th", "Client"), cell("th", "Entry file"), cell("th", "Hook config")]),
    ]),
    element("tbody", [
      element("tr", [cell("td", "claude"), cell("td", "CLAUDE.md"), cell("td", ".claude/settings.json")]),
      element("tr", [cell("td", "codex"), cell("td", "AGENTS.md"), cell("td", ".codex/hooks.json")]),
    ]),
  ]);
}

describe("the docs site's table header cells carry an explicit scope", () => {
  it("scopes every header cell of a rendered markdown table to its column", () => {
    const tree = run(markdownTable());

    expect(headerScopes(tree)).toEqual([
      ["Client", "col"],
      ["Entry file", "col"],
      ["Hook config", "col"],
    ]);
  });

  it("leaves the data cells alone", () => {
    const tree = run(markdownTable());

    const dataScopes: unknown[] = [];
    const walk = (node: HastNode): void => {
      if (node.type === "element" && node.tagName === "td") dataScopes.push(node.properties?.scope ?? null);
      for (const child of node.children ?? []) walk(child);
    };
    walk(tree);

    // Six cells, all of them still unscoped: `scope` on a `td` is invalid HTML, and a plugin that
    // sprayed the attribute over the whole table would still satisfy a `th`-only assertion.
    expect(dataScopes).toEqual([null, null, null, null, null, null]);
  });

  it("scopes a body row's opening header cell to its row, and refuses to guess at the ones after it", () => {
    // Raw HTML in a page can produce this; a markdown table cannot. The second `th` is the
    // deliberate non-decision — nothing in its position says whether it heads its row or its
    // column, and a wrong association tells a reader a value belongs to a header it does not.
    const tree = run(
      element("table", [
        element("thead", [element("tr", [cell("th", "Metric"), cell("th", "Q1"), cell("th", "Q2")])]),
        element("tbody", [
          element("tr", [cell("th", "Revenue"), cell("td", "120"), cell("th", "subtotal")]),
          element("tr", [cell("th", "Headcount"), cell("td", "14"), cell("td", "16")]),
        ]),
      ]),
    );

    expect(headerScopes(tree)).toEqual([
      ["Metric", "col"],
      ["Q1", "col"],
      ["Q2", "col"],
      ["Revenue", "row"],
      ["subtotal", null],
      ["Headcount", "row"],
    ]);
  });

  it("does not overwrite an association the page already stated", () => {
    const tree = run(
      element("table", [
        element("thead", [
          element("tr", [
            cell("th", "kept", { scope: "colgroup" }),
            // hast carries a space-separated attribute list as an array, which is how `headers`
            // arrives; an empty one is not an association and must still be scoped.
            cell("th", "referenced", { headers: ["h1"] }),
            cell("th", "empty headers", { headers: [] }),
            cell("th", "empty scope", { scope: "" }),
          ]),
        ]),
        element("tbody", [element("tr", [cell("td", "value"), cell("td", "value"), cell("td", "value"), cell("td", "value")])]),
      ]),
    );

    expect(headerScopes(tree)).toEqual([
      ["kept", "colgroup"],
      ["referenced", null],
      ["empty headers", "col"],
      ["empty scope", "col"],
    ]);
  });

  it("reads the first row of a section-less table as its header row", () => {
    const tree = run(
      element("table", [
        element("tr", [cell("th", "Name"), cell("th", "Status")]),
        element("tr", [cell("th", "first"), cell("td", "ok")]),
        element("tr", [cell("th", "second"), cell("td", "ok")]),
      ]),
    );

    expect(headerScopes(tree)).toEqual([
      ["Name", "col"],
      ["Status", "col"],
      ["first", "row"],
      ["second", "row"],
    ]);
  });

  it("annotates a nested table with its own sections rather than the outer table's", () => {
    const inner = element("table", [
      element("thead", [element("tr", [cell("th", "inner head")])]),
      element("tbody", [element("tr", [cell("th", "inner row"), cell("td", "v")])]),
    ]);
    const tree = run(
      element("table", [
        element("thead", [element("tr", [cell("th", "outer head")])]),
        element("tbody", [element("tr", [element("td", [inner])])]),
      ]),
    );

    // The inner table's header row would read as a BODY row if the walk carried the outer
    // `tbody` into it, and its `inner head` cell would come out `scope="row"`.
    expect(headerScopes(tree)).toEqual([
      ["outer head", "col"],
      ["inner head", "col"],
      ["inner row", "row"],
    ]);
  });

  it("walks a whole page tree, not just a bare table node", () => {
    const tree: HastNode = {
      type: "root",
      children: [
        element("main", [
          element("h2", [{ type: "text" }]),
          element("div", [markdownTable()]),
          element("div", [markdownTable()]),
        ]),
      ],
    };

    // Six header cells over two tables, every one of them scoped: the plugin is handed the page
    // root, and a transform that only handled a table at the top would leave all six bare.
    expect(headerScopes(run(tree)).map(([, scope]) => scope)).toEqual(["col", "col", "col", "col", "col", "col"]);
  });
});
