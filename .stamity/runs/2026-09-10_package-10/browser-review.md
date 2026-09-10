# Package 10 browser verification

PASS: 46 scenarios, including 44 page/theme/width scans with zero axe violations,
zero browser page errors and no document-level horizontal overflow. Eleven routes
cover the five changed or retained guides and all six shared reference pages, at
375px and 1440px in light and dark themes. Actual Tab/ArrowRight probes reach every
overflowing table, with visible focus and observed scrolling; separate viewport,
font-size and no-JavaScript probes pass.

Run identity: `99c1094-dirty`; this explicitly identifies an uncommitted candidate,
not the released baseline. Verified source digest
`b099abbc995aa6a93865824f12c581374ac22e09c24073afd7d2d3e8c6734d0d`;
website build digest
`b55042d36fe1ccde8e13bb4f73752eb4b929e1e7671a89a621351504453eafa6`.
The later candidate binding must compare the actual source inventory.

Playwright 1.63.0, axe-core 4.13.0, Chrome for Testing 146.0.7680.153; WCAG2A,
WCAG2AA, WCAG21A, WCAG21AA and best-practice tags, without rule exclusions.
The first failed run remains retained: 20 scans passed before axe found an H1→H3
jump on skills. The fixed generator promotes 52 ungrouped headings across six
pages without changing names/anchors or content; independent source review and
this fresh expanded browser run verify the correction.

Raw output is available at `/tmp/stamity-package10-browser-evidence/` and durably
archived separately. Twelve actual focus screenshots were captured; mobile dark
and desktop light enterprise-table captures were opened. No visual comparison
baseline exists, so no visual-regression pass or refreshed baseline is claimed.
Human screen-reader and complete keyboard journeys remain unperformed.

Candidate binding: all 1,071 verified source inputs and54 render-source inputs match
implementation commit `4e649f8a703021a3c0e4e057c258942b2330220f`. The bundle is
`.stamity/evidence/browser-99c1094-dirty.json`; its original dirty run identity is
preserved alongside the subsequent byte-comparison binding.
