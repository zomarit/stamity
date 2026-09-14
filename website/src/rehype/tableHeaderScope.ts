/**
 * Give every rendered table header cell an explicit `scope`.
 *
 * WHAT IS BROKEN WITHOUT IT. A markdown table is the only table shape these pages have, and the
 * renderer emits a bare `<th>` for each of its header cells. A `th` that carries neither `scope`
 * nor an inbound `headers=` reference heads nothing a screen reader can attach a cell to: the
 * column titles are announced once, at the top, and every value below arrives unlabelled. That is
 * WCAG 1.3.1 — the association a sighted reader gets from the layout has to survive in the markup
 * — and it is what the QA harness's accessibility-tree row (H2) measures, cell by cell: every `th`
 * carries `scope` or is referenced through `headers=`. The four pages with tables fail that row
 * 52 cells over, all of them for the same reason.
 *
 * WHY A REHYPE PLUGIN RATHER THAN A REMARK ONE. `scope` is an HTML attribute, and it exists at
 * the hast stage: remark sees a `tableCell` with an alignment and a header flag, so the same
 * change there would be a guess about what the renderer will emit. Here the `th` elements are the
 * ones the build writes.
 *
 * WHAT IT DECIDES, AND WHAT IT DELIBERATELY DOES NOT.
 *
 *   `th` in a header row   `scope="col"` — it heads the column beneath it. This is the only shape
 *                          a markdown table produces, and the whole of the 52.
 *   first cell of a body   `scope="row"` — it heads the row it opens. Reachable only through raw
 *     row, and a `th`      HTML in a page, so it is handled defensively rather than relied on.
 *   `th` elsewhere in a    LEFT ALONE. Nothing in its position says whether it heads its row or
 *     body row             its column, and a wrong association reads worse than none: the reader
 *                          is told a value belongs to a header it does not belong to. The harness
 *                          reporting such a cell is the correct outcome — the fix is `headers=`
 *                          in the page that wrote the table, not a rule invented here.
 *   `scope` or `headers`   LEFT ALONE. A page that stated the association already outranks this
 *     already present      plugin's positional rule.
 *
 * A table with no `thead`/`tbody` — again, raw HTML only — has its first row read as the header
 * row, which is what an author who wrote `<table><tr><th>` meant. A table nested inside a cell is
 * annotated in its own right, with its own sections, never with the outer table's.
 */

/** Which half of a table a row sits in: the one fact that decides a header cell's scope. */
type Section = 'head' | 'body';

/** The `type` of a hast section element, mapped to the section it opens. */
const SECTION_OF: Readonly<Record<string, Section>> = {
  thead: 'head',
  tbody: 'body',
  tfoot: 'body',
};

/** The part of a hast node this plugin reads. Declared locally, so the site's build is the only consumer of hast's own types. */
interface HastNode {
  type: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
}

/** `true` when an attribute is present with something in it — hast carries `headers` as a list. */
function isSet(value: unknown): boolean {
  if (typeof value === 'string') return value.trim() !== '';
  if (Array.isArray(value)) return value.length > 0;
  return false;
}

/** One row: the header cells that take a scope from their position take it here. */
function annotateRow(row: HastNode, section: Section): void {
  let cell = 0;
  for (const child of row.children ?? []) {
    if (child.type !== 'element') continue;
    const index = cell;
    cell += 1;
    if (child.tagName !== 'th') continue;

    const properties = child.properties ?? {};
    if (isSet(properties.scope) || isSet(properties.headers)) continue;

    // The one positional rule, and its one deliberate gap: a `th` past the first cell of a body
    // row gets nothing. See the header note.
    if (section === 'body' && index !== 0) continue;

    child.properties = {...properties, scope: section === 'head' ? 'col' : 'row'};
  }
}

/** Every row of one table, paired with the section it belongs to. Rows of a nested table are not this table's. */
function annotateTable(table: HastNode): void {
  let sectionless = 0;

  const walk = (node: HastNode, section: Section | undefined): void => {
    if (node !== table && node.type === 'element' && node.tagName === 'table') return;

    if (node.type === 'element' && node.tagName === 'tr') {
      let rowSection = section;
      if (rowSection === undefined) {
        // No `thead`/`tbody` around it: the first row of such a table is its header row.
        rowSection = sectionless === 0 ? 'head' : 'body';
        sectionless += 1;
      }
      annotateRow(node, rowSection);
      return;
    }

    const inner =
      node.type === 'element' ? (SECTION_OF[node.tagName ?? ''] ?? section) : section;
    for (const child of node.children ?? []) walk(child, inner);
  };

  walk(table, undefined);
}

export default function tableHeaderScope() {
  return function transformer(tree: HastNode): void {
    const walk = (node: HastNode): void => {
      if (node.type === 'element' && node.tagName === 'table') annotateTable(node);
      for (const child of node.children ?? []) walk(child);
    };
    walk(tree);
  };
}
