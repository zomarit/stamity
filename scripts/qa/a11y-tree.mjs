#!/usr/bin/env node
// The accessibility tree of each built page, checked against three structural claims, with a
// scanner run beside it.
//
// The tree is what a screen reader is handed, and it is not the DOM: a heading that looks like a
// section title because it is large and bold is an `h4` to the tree, and a link whose whole label
// is an icon has no name at all there. So the three checks read the tree and the markup that
// produces it, rather than the rendered picture:
//
//   HEADINGS NEVER SKIP A LEVEL — `h2` then `h4` tells a reader listening to the outline that a
//   section is missing. The check walks the page's headings in document order and fails on any
//   jump of more than one level downward.
//   EVERY LINK HAS A NAME — an unnamed link is announced as "link" and nothing else, which is a
//   dead end in a list of links. The name is the accessible one (text, `aria-label`,
//   `aria-labelledby`, or an image's alt), never the `href`.
//   EVERY `th` IS ASSOCIATED — a header cell that neither carries `scope` nor is pointed at by a
//   cell's `headers` attribute is a header the reader cannot attach to the cell it heads, which is
//   the difference between a table and a list of unlabelled values.
//
// The scanner (axe-core, through `@axe-core/playwright`) runs beside them and its violation count
// is RECORDED, not asserted: it covers rules these three do not, and a count is the honest shape
// for a signal whose ruleset moves between versions. The three structural checks are the gate.
//
// `page.accessibility.snapshot()` is called where the runtime still carries it, and its absence is
// recorded as a fact about the harness rather than swallowed — a check that silently stops reading
// the tree is a check that passes for the wrong reason.

/* oxlint-disable no-await-in-loop -- Pages are audited one at a time through one browser context;
   five concurrent scanner runs against one Chromium would contend for the same renderer and make
   the violation counts a function of scheduling. */

/** Collect every heading in document order with the level the tree reads it at. */
const HEADINGS = () =>
  [...globalThis.document.querySelectorAll('h1,h2,h3,h4,h5,h6,[role="heading"]')].map((element) => ({
    level:
      element.getAttribute('aria-level') === null
        ? Number(element.tagName.slice(1))
        : Number(element.getAttribute('aria-level')),
    text: (element.textContent ?? '').trim().slice(0, 80),
    hidden: element.getAttribute('aria-hidden') === 'true',
  }))

/**
 * Every rendered link with the name a reader would hear.
 *
 * The name is assembled the way the accessibility tree assembles it, in precedence order, with the
 * `href` deliberately excluded: a link whose only name is its URL is exactly the failure this check
 * exists for, and folding the URL in as a fallback would report it as named.
 */
const LINKS = () =>
  [...globalThis.document.querySelectorAll('a[href],[role="link"]')]
    .filter((element) => {
      const style = globalThis.getComputedStyle(element)
      if (style.display === 'none' || style.visibility === 'hidden') return false
      return element.getAttribute('aria-hidden') !== 'true'
    })
    .map((element) => {
      const labelledBy = element.getAttribute('aria-labelledby')
      const referenced =
        labelledBy === null
          ? ''
          : labelledBy
              .split(/\s+/)
              .map((id) => globalThis.document.getElementById(id)?.textContent ?? '')
              .join(' ')
      const image = element.querySelector('img[alt]')
      const name =
        (element.getAttribute('aria-label') ?? '').trim() ||
        referenced.trim() ||
        (element.textContent ?? '').trim() ||
        (image?.getAttribute('alt') ?? '').trim() ||
        (element.querySelector('svg title')?.textContent ?? '').trim()
      return { name, href: element.getAttribute('href') ?? '', outerHTML: element.outerHTML.slice(0, 140) }
    })

/** Every `th`, with how (or whether) it is associated to the cells it heads. */
const HEADER_CELLS = () =>
  [...globalThis.document.querySelectorAll('th')].map((element) => {
    const id = element.id
    const referenced =
      id !== '' && globalThis.document.querySelector(`[headers~="${globalThis.CSS.escape(id)}"]`) !== null
    return {
      scope: element.getAttribute('scope'),
      referencedByHeaders: referenced,
      text: (element.textContent ?? '').trim().slice(0, 60),
    }
  })

/** Heading levels in order, failing on any downward jump bigger than one. */
export function headingFindings(headings) {
  const findings = []
  let previous = null
  for (const heading of headings) {
    if (heading.hidden) continue
    if (!Number.isFinite(heading.level)) {
      findings.push(`heading "${heading.text}" declares no readable level`)
      continue
    }
    if (previous !== null && heading.level > previous + 1) {
      findings.push(
        `heading level jumps from h${previous} to h${heading.level} at "${heading.text}" — a level is skipped`,
      )
    }
    previous = heading.level
  }
  return findings
}

/** A link with an empty accessible name is announced as "link" and nothing else. */
export function linkFindings(links) {
  return links
    .filter((link) => link.name === '')
    .map((link) => `link to "${link.href}" has no accessible name: ${link.outerHTML}`)
}

/** A `th` with neither `scope` nor an inbound `headers` reference heads nothing a reader can hear. */
export function headerCellFindings(cells) {
  return cells
    .filter((cell) => (cell.scope === null || cell.scope === '') && !cell.referencedByHeaders)
    .map(
      (cell) =>
        `table header "${cell.text}" carries no scope and no cell references it through headers=`,
    )
}

/**
 * Read the accessibility tree.
 *
 * Playwright has deprecated `page.accessibility.snapshot()` in favour of ARIA snapshots, and a
 * runtime that has removed it must say so rather than have the caller quietly stop reading the
 * tree: the returned record carries either the node count or the reason there is none.
 */
export async function treeSnapshot(page) {
  if (page.accessibility === undefined || typeof page.accessibility.snapshot !== 'function') {
    return { available: false, reason: 'this Playwright build exposes no page.accessibility.snapshot()' }
  }
  const snapshot = await page.accessibility.snapshot()
  if (snapshot === null) return { available: true, nodes: 0, roles: {} }
  const roles = {}
  let nodes = 0
  const walk = (node) => {
    nodes += 1
    roles[node.role] = (roles[node.role] ?? 0) + 1
    for (const child of node.children ?? []) walk(child)
  }
  walk(snapshot)
  return { available: true, nodes, roles }
}

/**
 * One page: the three structural checks, the tree census, and the scanner's violation count.
 *
 * `axeBuilder` is injected rather than imported here so a run with no scanner installed reports
 * that fact on the row instead of failing to load the module — the structural checks are still
 * worth running without it, and the row says the scanner did not run.
 */
export async function auditPage({ context, baseUrl, path, axeBuilder }) {
  const page = await context.newPage()
  try {
    const response = await page.goto(`${baseUrl}${path}`, { waitUntil: 'load' })
    const statusCode = response === null ? null : response.status()
    // The tree is read after hydration for the same reason the keyboard walk is: this is a React
    // site, and half its links and every one of its code-block controls arrive with the client
    // bundle. A tree read at first paint is a tree of a page nobody sees.
    if (statusCode === null || statusCode < 400) await page.waitForLoadState('networkidle')
    if (statusCode !== null && statusCode >= 400) {
      return {
        page: path,
        status: 'fail',
        reason: `the built site served HTTP ${statusCode} for this path`,
        findings: [`HTTP ${statusCode}`],
      }
    }

    const [headings, links, cells, tree] = [
      await page.evaluate(HEADINGS),
      await page.evaluate(LINKS),
      await page.evaluate(HEADER_CELLS),
      await treeSnapshot(page),
    ]

    const findings = [
      ...headingFindings(headings),
      ...linkFindings(links),
      ...headerCellFindings(cells),
    ]

    let scanner = { ran: false, reason: 'no scanner was supplied to this run' }
    if (axeBuilder !== undefined) {
      const results = await axeBuilder(page).analyze()
      scanner = {
        ran: true,
        violations: results.violations.length,
        serious: results.violations.filter((v) => v.impact === 'serious').length,
        critical: results.violations.filter((v) => v.impact === 'critical').length,
        ids: results.violations.map((v) => `${v.id}(${v.impact}×${v.nodes.length})`),
      }
    }

    return {
      page: path,
      status: findings.length === 0 ? 'pass' : 'fail',
      reason:
        findings.length === 0
          ? `${headings.length} heading(s), ${links.length} link(s), ${cells.length} header cell(s) — all three structural checks hold`
          : findings.join(' · '),
      counts: { headings: headings.length, links: links.length, headerCells: cells.length },
      tree,
      scanner,
      findings,
    }
  } finally {
    await page.close()
  }
}

/** Every page, one context. The tree does not depend on viewport, so one pass covers the set. */
export async function runA11yTree({ browser, baseUrl, pages, axeBuilder }) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  try {
    const results = []
    for (const path of pages) {
      results.push(await auditPage({ context, baseUrl, path, axeBuilder }))
    }
    return results
  } finally {
    await context.close()
  }
}
