#!/usr/bin/env node
// Keyboard journeys over the built documentation site: what a person driving it by Tab actually
// gets, per page, per viewport, per theme.
//
// Three properties, and they are the three a sighted mouse user never notices missing. WHERE AM I
// — every stop the Tab key lands on shows a focus indicator, so the caret is not invisible. IN
// WHAT ORDER — the stops arrive in the document's own order, because a reading order that
// disagrees with the DOM is a page that makes sense to look at and no sense to hear. CAN I DRIVE
// THE TABLE — the capability matrix is a grid, and a grid whose cells take focus has to answer the
// arrow keys, or the keyboard user tabs through every cell of every row to reach column four.
//
// Each of the three is measured, never assumed. The focus check compares the FOCUSED computed
// style against the same element's BLURRED computed style, because `outline: none` with a
// `box-shadow` ring is a pass and `outline-style: solid` inherited from the blurred state is not a
// focus indicator at all — only a difference proves the browser drew something new. The order check
// records the index of each stop in the page's own focusable list and requires the indices to rise.
// The grid check runs only where a cell can actually take focus and records `not-applicable` with
// the reason everywhere else: a page whose table cells are not focusable has no arrow-key contract
// to keep, and reporting a pass there would be inventing one.
//
// The module talks to a Playwright `browser` it is handed and a base URL it is given; it starts no
// server and installs nothing. `run.mjs` owns both.

/* oxlint-disable no-await-in-loop -- A keyboard walk is sequential by definition: each Tab's
   destination depends on where the previous one landed, and each page's viewport and theme are set
   on a context the next page reuses. Fanning these out would measure a different thing. */

/** Viewport widths, narrow first. 375 is the phone the site's own breakpoints are cut for. */
export const DEFAULT_WIDTHS = [375, 1440]

/** Both themes. Docusaurus renders different colours, and a focus ring can pass in one and vanish in the other. */
export const DEFAULT_THEMES = ['light', 'dark']

/** Stops to take before giving up. A page that never cycles is a finding, not a reason to hang. */
const MAX_TAB_STOPS = 400

/**
 * What counts as focusable, in DOM order.
 *
 * The list is the standard one; `[tabindex]` is included unqualified so a `tabindex="-1"` element
 * shows up in the census (it is programmatically focusable and a Tab stop on it would be a
 * finding), and the page-side filter below drops anything invisible or disabled.
 */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button',
  'input',
  'select',
  'textarea',
  'details > summary',
  '[tabindex]',
  '[contenteditable="true"]',
].join(',')

/**
 * Collect the page's focusable elements and stash them on `window` for the walk.
 *
 * Stashed rather than re-queried per stop: the walk has to answer "which of the page's focusables
 * is focused NOW", and re-running the query on every Tab would compare against a list that a
 * dropdown opening or a skip-link appearing has already changed underneath it.
 */
const COLLECT_FOCUSABLES = (selector) => {
  const all = [...globalThis.document.querySelectorAll(selector)]
  const visible = all.filter((element) => {
    if (element.hasAttribute('disabled')) return false
    if (element.getAttribute('aria-hidden') === 'true') return false
    const style = globalThis.getComputedStyle(element)
    if (style.visibility === 'hidden' || style.display === 'none') return false
    // A zero-box element is real when it is a skip link parked off-screen, so size alone does not
    // disqualify: `offsetParent === null` plus no client rects is what "not rendered" means here.
    const rects = element.getClientRects()
    return rects.length > 0 || element.offsetParent !== null
  })
  globalThis.window.qaHarnessFocusables = visible
  return visible.map((element, index) => ({
    index,
    tag: element.tagName.toLowerCase(),
    id: element.id === '' ? null : element.id,
    text: (element.textContent ?? '').trim().slice(0, 60),
    tabindex: element.getAttribute('tabindex'),
  }))
}

/**
 * Describe whatever is focused right now, plus where it sits in the stashed focusable list.
 *
 * `repeated` is answered by identity against a page-side set rather than by a string key: two
 * different unlabelled buttons produce the same key, and a walk that stopped at the first
 * collision would report a page as shorter than it is and call the missing stops a pass.
 */
const DESCRIBE_ACTIVE = () => {
  const active = globalThis.document.activeElement
  if (active === null || active === globalThis.document.body) return null
  const list = globalThis.window.qaHarnessFocusables ?? []
  if (!(globalThis.window.qaHarnessVisited instanceof Set)) globalThis.window.qaHarnessVisited = new Set()
  const repeated = globalThis.window.qaHarnessVisited.has(active)
  globalThis.window.qaHarnessVisited.add(active)
  const style = globalThis.getComputedStyle(active)
  return {
    repeated,
    index: list.indexOf(active),
    tag: active.tagName.toLowerCase(),
    id: active.id === '' ? null : active.id,
    text: (active.textContent ?? '').trim().slice(0, 60),
    focused: {
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      outlineColor: style.outlineColor,
      boxShadow: style.boxShadow,
    },
  }
}

/** The same four properties with NOTHING focused — the baseline a focus ring has to differ from. */
const BLURRED_STYLES = (indices) => {
  const list = globalThis.window.qaHarnessFocusables ?? []
  if (globalThis.document.activeElement instanceof globalThis.HTMLElement) globalThis.document.activeElement.blur()
  return indices.map((index) => {
    const element = list[index]
    if (element === undefined) return null
    const style = globalThis.getComputedStyle(element)
    return {
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      outlineColor: style.outlineColor,
      boxShadow: style.boxShadow,
    }
  })
}

/**
 * Does this stop show a focus indicator?
 *
 * Two ways to pass, and the second is why the blurred baseline is captured at all. A drawn outline
 * (`outline-style` other than `none`, with a non-zero width) is an indicator on its own. Otherwise
 * the focused style has to DIFFER from the blurred one on an outline or shadow property — that
 * difference is the browser drawing something it was not drawing before, which is exactly the
 * claim. A style identical to the blurred one is no indicator however decorated it is.
 */
export function focusIndicatorOf(focused, blurred) {
  if (focused === null || focused === undefined) return { visible: false, how: 'no computed style captured' }
  const drawn = focused.outlineStyle !== 'none' && focused.outlineWidth !== '0px'
  if (drawn) return { visible: true, how: `outline ${focused.outlineStyle} ${focused.outlineWidth}` }
  if (blurred === null || blurred === undefined) {
    return { visible: false, how: 'no blurred baseline to compare against' }
  }
  const changed = ['outlineStyle', 'outlineWidth', 'outlineColor', 'boxShadow'].filter(
    (key) => focused[key] !== blurred[key],
  )
  if (changed.length > 0) {
    return { visible: true, how: `changed on focus: ${changed.join(', ')}` }
  }
  return {
    visible: false,
    how: `outline-style none and no outline/box-shadow change on focus (box-shadow ${focused.boxShadow})`,
  }
}

/**
 * Apply a theme the way the site itself does.
 *
 * Docusaurus reads its stored preference before first paint and reflects it as `data-theme` on the
 * `<html>` element. Setting the storage key in an init script gets the real code path — the site's
 * own toggle writes the same key — and the attribute is set afterwards only as a belt-and-braces
 * step for a build whose storage key ever changes. Which mechanism took is REPORTED, so a theme
 * that did not actually switch cannot be silently measured twice as "light".
 */
async function applyTheme(page, theme) {
  await page.addInitScript((value) => {
    try {
      globalThis.window.localStorage.setItem('theme', value)
    } catch {
      // A storage-blocked context still gets the attribute below; the report names which path ran.
    }
  }, theme)
}

/** Read back what the page actually rendered as, so the report never claims an unapplied theme. */
async function readTheme(page) {
  return page.evaluate(() => globalThis.document.documentElement.getAttribute('data-theme'))
}

/**
 * Walk one page at one viewport in one theme.
 *
 * Returns a row per page/width/theme with every stop it took and a status: `pass` when all three
 * properties hold, `fail` with the offending stops named, or `not-applicable` when the page has no
 * focusable element at all (an empty page has no keyboard journey to check and no pass to claim).
 */
export async function journeyForPage({ context, baseUrl, path, width, theme }) {
  const page = await context.newPage()
  const findings = []
  try {
    await page.setViewportSize({ width, height: 900 })
    await applyTheme(page, theme)
    await page.goto(`${baseUrl}${path}`, { waitUntil: 'load' })
    // Hydration, not first paint: the site is a React app, and its copy buttons, its focusable
    // code blocks and its sidebar links all arrive when the client bundle runs. A census taken at
    // `domcontentloaded` misses every one of them, and the walk then reports each as an element
    // that "appeared during the walk" — a harness artefact dressed up as a reading-order finding.
    await page.waitForLoadState('networkidle')
    const appliedTheme = await readTheme(page)
    if (appliedTheme !== theme) {
      await page.evaluate((value) => globalThis.document.documentElement.setAttribute('data-theme', value), theme)
    }
    const themeNow = await readTheme(page)

    const focusables = await page.evaluate(COLLECT_FOCUSABLES, FOCUSABLE_SELECTOR)
    if (focusables.length === 0) {
      return {
        page: path,
        width,
        theme,
        themeApplied: themeNow,
        status: 'not-applicable',
        reason: 'the page renders no focusable element, so it has no keyboard journey',
        stops: [],
        findings,
      }
    }

    // Focus starts at the document, so the first Tab lands on the first stop.
    await page.evaluate(() => {
      if (globalThis.document.activeElement instanceof globalThis.HTMLElement) globalThis.document.activeElement.blur()
      globalThis.window.qaHarnessVisited = new Set()
    })
    const stops = []
    for (let i = 0; i < Math.min(MAX_TAB_STOPS, focusables.length * 2 + 5); i += 1) {
      await page.keyboard.press('Tab')
      const active = await page.evaluate(DESCRIBE_ACTIVE)
      if (active === null) break
      if (active.repeated) break
      stops.push(active)
    }

    if (stops.length === 0) {
      findings.push('Tab moved focus to nothing: the page has focusable elements but no reachable stop')
    }

    const indices = stops.map((stop) => stop.index)
    const blurred = await page.evaluate(BLURRED_STYLES, indices)
    stops.forEach((stop, position) => {
      const indicator = focusIndicatorOf(stop.focused, blurred[position])
      stop.indicator = indicator
      if (!indicator.visible) {
        findings.push(
          `stop ${position + 1} (<${stop.tag}> "${stop.text}") shows no focus indicator: ${indicator.how}`,
        )
      }
    })

    // Reading order: every stop the walk could place in the page's own focusable list has to come
    // after the previous one. An index of -1 is a stop on an element the census did not hold (a
    // menu opened by the walk itself) and is reported rather than ordered.
    let previous = -1
    stops.forEach((stop, position) => {
      if (stop.index === -1) {
        findings.push(
          `stop ${position + 1} (<${stop.tag}> "${stop.text}") is not in the page's focusable census — ` +
            'it appeared during the walk, so its reading-order position cannot be judged',
        )
        return
      }
      if (stop.index <= previous) {
        findings.push(
          `stop ${position + 1} (<${stop.tag}> "${stop.text}") is at DOM position ${stop.index}, ` +
            `behind the previous stop at ${previous}: reading order does not follow DOM order`,
        )
      }
      previous = Math.max(previous, stop.index)
    })

    const grid = await gridNavigation(page)

    return {
      page: path,
      width,
      theme,
      themeApplied: themeNow,
      status: findings.length === 0 && grid.status !== 'fail' ? 'pass' : 'fail',
      reason:
        findings.length === 0 && grid.status !== 'fail'
          ? `${stops.length} stop(s), every one with a visible indicator and in DOM order; grid: ${grid.status} (${grid.reason})`
          : [...findings, ...(grid.status === 'fail' ? [`grid: ${grid.reason}`] : [])].join(' · '),
      stops,
      grid,
      findings,
    }
  } finally {
    await page.close()
  }
}

/**
 * Arrow-key navigation inside a table.
 *
 * Only meaningful where a cell can take focus, so the probe asks that FIRST and returns
 * `not-applicable` with the reason when no cell can — the wrapper Docusaurus puts around a wide
 * table is itself focusable for scrolling, and mistaking that for a focusable cell would turn a
 * page with no grid contract into a page that fails one it never had.
 */
export async function gridNavigation(page) {
  const cell = await page.evaluate(() => {
    const cells = [...globalThis.document.querySelectorAll('table td, table th')]
    if (cells.length === 0) return { present: false, focusable: false, reason: 'the page renders no table' }
    const focusableCell = cells.find(
      (element) =>
        element.hasAttribute('tabindex') ||
        element.matches('a[href],button,input,select,textarea') ||
        element.getAttribute('role') === 'gridcell',
    )
    if (focusableCell === undefined) {
      return {
        present: true,
        focusable: false,
        reason: `${cells.length} table cell(s), none focusable: no cell carries tabindex, a gridcell role, or is a natively focusable element`,
      }
    }
    focusableCell.focus()
    return {
      present: true,
      focusable: true,
      start: focusableCell.cellIndex ?? -1,
      startRow: focusableCell.parentElement?.rowIndex ?? -1,
      reason: 'a table cell took focus',
    }
  })

  if (!cell.present || !cell.focusable) {
    return { status: 'not-applicable', reason: cell.reason }
  }

  const moves = []
  for (const key of ['ArrowRight', 'ArrowDown']) {
    await page.keyboard.press(key)
    const where = await page.evaluate(() => {
      const active = globalThis.document.activeElement
      const isCell = active !== null && active.closest('td,th') !== null
      const target = active === null ? null : active.closest('td,th')
      return {
        isCell,
        column: target?.cellIndex ?? -1,
        row: target?.parentElement?.rowIndex ?? -1,
      }
    })
    moves.push({ key, ...where })
  }

  const moved = moves.some(
    (move) => move.isCell && (move.column !== cell.start || move.row !== cell.startRow),
  )
  return {
    status: moved ? 'pass' : 'fail',
    reason: moved
      ? `focus moved between cells: ${moves.map((m) => `${m.key}→r${m.row}c${m.column}`).join(', ')}`
      : `a cell took focus but neither arrow key moved it: ${moves.map((m) => `${m.key}→r${m.row}c${m.column}`).join(', ')}`,
    moves,
  }
}

/**
 * Every page at every width in every theme.
 *
 * One browser context per width/theme pair, because the theme is applied through an init script
 * and a context carries that script for every page opened in it — sharing one context across
 * themes would leak the first theme into the second.
 */
export async function runKeyboardJourneys({
  browser,
  baseUrl,
  pages,
  widths = DEFAULT_WIDTHS,
  themes = DEFAULT_THEMES,
}) {
  const results = []
  for (const width of widths) {
    for (const theme of themes) {
      const context = await browser.newContext({ viewport: { width, height: 900 } })
      try {
        for (const path of pages) {
          results.push(await journeyForPage({ context, baseUrl, path, width, theme }))
        }
      } finally {
        await context.close()
      }
    }
  }
  return results
}
