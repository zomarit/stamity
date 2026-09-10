# Final documentation candidate verification

Documentation candidate: `caec7fac5e45d82ad1b766c30affd3696829c690`. Runtime/workflow gate candidate: `0f7b0e9a457c6c78c96eb3cb9c24c3802d85718b`.

Verdict: **pass**. The final documentation build, typecheck and browser checks passed. The only changes from the fully gated product candidate are the enterprise guide, plan and inbox; `source-binding.json` confirms no change to packaged runtime, corpus, scripts, workflows, website code/config, package metadata or APM/plugin output. Root product files were untouched; no commits were made.

`npm ci --ignore-scripts` and `npm run typecheck && npm run build` ran in the final documentation candidate's isolated `website/` and exited 0. The fresh production build is served at `http://127.0.0.1:4184`; the enterprise guide is `/docs/enterprise-forks/`. The server remains available in tool session 88285 for the human QA checkpoint.

The final browser harness reused the previously authorized Playwright 1.63.0, Chrome 146.0.7680.153 and axe-core 4.13.0 tools. Its scenarios are unchanged; paths, target port and source binding identify this final build.

- Enterprise forks, getting started and customization each passed light/dark scans at 375px and 1440px: **12 scans, zero serious/critical/other violations and zero page errors**. WCAG 2A/AA, 2.1A/AA and best-practice rules ran without exclusions.
- All **20 overflowing table instances** were reached through actual Tab traversal and scrolled with ArrowRight. Focus outlines were visible; fitting tables stayed outside the hydrated tab order.
- Native table/columnheader accessibility roles, page overflow checks, viewport resize, enlarged-text overflow transitions and no-JavaScript table fallback passed. Fourteen scenario rows passed in total.
- The verifier opened the final mobile light/dark enterprise captures and observed the visible outline and readable text. Their `opened` fields were finalized before bundle hashing. Other screenshots remain uninspected captures. There is no committed visual baseline or pixel tolerance, so no screenshot-diff result is claimed.

The final raw bundle is `a11y/bundle.json`; `browser-caec7fa.json` is a ready-to-copy public projection with its exact retention hash. Detailed scenario, axe and accessibility-tree files, screenshots and the reusable script are retained and hashed. This completed directory is a new immutable-by-convention evidence snapshot; earlier 0f7b0e9 product verification and da7d8a7 browser records remain untouched.

Human screen-reader review and a complete human keyboard journey remain unperformed. A passing automated table probe does not mark those rows complete. Required human QA/sign-off, current GitHub CI, platform approval, actual publication and postpublication checks remain the coordinator's controls. No fresh eval was run; the approved release-only reuse and limitations remain unchanged.
