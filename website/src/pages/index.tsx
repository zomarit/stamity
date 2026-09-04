import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import CodeBlock from '@theme/CodeBlock';
import Layout from '@theme/Layout';
import {useEffect, useRef, type ReactNode} from 'react';

/**
 * The landing page: name, pitch, the one line that installs it, and the two ways on.
 *
 * Deliberately thin. Everything a reader needs after the install line is a page in `docs/`, and
 * a feature grid here would be a second, unversioned description of the same product — the
 * duplication this site is arranged to avoid. The title and pitch come from `docusaurus.config.ts`
 * so there is one place to change them.
 */
export default function Home(): ReactNode {
  const {siteConfig} = useDocusaurusContext();
  const mainRef = useRef<HTMLElement>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);

  /*
   * THE COPY CONTROL ANNOUNCES NOTHING, AND THIS PAGE FIXES THAT FOR ITS OWN BLOCK.
   *
   * The theme's copy button flips its `aria-label` from "Copy code to clipboard" to "Copied" and
   * back a second later — `CodeBlock/Buttons/CopyButton/index.js:53-62` in
   * `@docusaurus/theme-classic/lib/theme/` — and ships no live region: a grep for `aria-live`
   * across that same `theme/` directory returns nothing, and probing the built site returns an
   * empty list of live regions on every page. A change of accessible name on a control that a
   * pointer activation may leave unfocused is not a status message, so WCAG 4.1.3 is unmet on the
   * one line this page exists to hand a reader.
   *
   * THE CLICK ARMS; THE THEME'S OWN LABEL CONFIRMS. A click listener alone would announce a
   * success that did not happen: the theme's handler is `copyToClipboard(code).then(...)` with no
   * `.catch` — its own comment says errors are left unhandled on purpose, for observability — so
   * when the write is rejected (a denied permission, an insecure context with the fallback
   * unavailable) nothing about the button changes, and a click-triggered announcement would be a
   * lie the reader then acts on. So the click only records the resting label, and the
   * announcement is emitted when a MutationObserver sees that label move. The theme's own revert
   * clears the region, which is why this page owns no timer and has no teardown race with one.
   *
   * DELEGATION IS NOT A STYLE CHOICE, AND `main` IS THE ONLY SAFE ROOT FOR IT. Two theme
   * behaviours put every node below it out of reach of a mount-time query. The button group is
   * rendered inside `<BrowserOnly>` — "Code block buttons are not server-rendered on purpose",
   * `CodeBlock/Buttons/index.js:13` — so the button does not exist in the first client render.
   * And the block ITSELF is replaced: `CodeBlock/index.js:29-36` keys the whole subtree on
   * `String(useIsBrowser())` to force a re-render once the Prism theme is known, so hydration
   * remounts it and the container element captured at mount is a detached node a moment later.
   * That was measured, not reasoned about: an earlier revision of this effect held the block, and
   * a probe against the built site read an empty live region while the button's own `aria-label`
   * flipped to "Copied" — the listener and the observer were both on a node no longer in the
   * page. `main` carries the page's own ref, is never remounted, and the block is resolved from
   * the event target instead. Reading the resting label inside the handler also means no English
   * string is written down here, so the theme's own `translate()` keeps working in any locale the
   * site adds.
   */
  useEffect(() => {
    const root = mainRef.current;
    const status = statusRef.current;
    if (!root || !status) {
      return undefined;
    }

    let resting: string | null = null;

    const onClick = (event: Event) => {
      const button = (event.target as Element | null)?.closest('button');
      // Armed from rest only. The theme reverts the label on a 1000 ms timeout that a
      // repeat click neither clears nor restarts (`CopyButton/index.js:52-61`:
      // `setIsCopied(true)` is a no-op while already copied, so no attribute mutation
      // fires and a second `setTimeout` is queued behind the first). Capturing the
      // CURRENT label on every click would therefore record "Copied" as the resting
      // name for a click inside that window, and the first timeout's revert would then
      // read as a new state and announce "Copy code to clipboard" — a status whose text
      // contradicts the state, to exactly the reader who pressed twice because the first
      // press gave no feedback. `resting` is nulled by the revert below, so the next
      // cycle re-arms; until then the original resting label stands and the revert
      // matches it.
      if (button?.closest('.landing__install') && resting === null) {
        resting = button.getAttribute('aria-label');
      }
    };
    root.addEventListener('click', onClick);

    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.attributeName !== 'aria-label' || resting === null) {
          continue;
        }
        const target = record.target as Element;
        if (!target.closest('.landing__install')) {
          continue;
        }
        const label = target.getAttribute('aria-label');
        if (label === resting) {
          status.textContent = '';
          resting = null;
        } else if (label) {
          status.textContent = label;
        }
      }
    });
    observer.observe(root, {subtree: true, attributes: true, attributeFilter: ['aria-label']});

    return () => {
      root.removeEventListener('click', onClick);
      observer.disconnect();
    };
  }, []);

  return (
    <Layout title={siteConfig.title} description={siteConfig.tagline}>
      <main className="landing" ref={mainRef}>
        <h1 className="landing__title">{siteConfig.title}</h1>
        <p className="landing__pitch">{siteConfig.tagline}</p>

        {/*
         * The theme's own code block, not a bare `pre`, and the reason is the copy button: this is
         * the one line on the site a reader is meant to take away with them, and a hand-rolled
         * `pre` is the only place on the whole site where copying is a manual selection. `sh`
         * matches the fence `docs/getting-started.md` uses for the same command, so the two render
         * identically. `className` lands on the block's outer container — see `.landing__install`
         * in `src/css/custom.css` for what is adjusted there and what is left to the theme.
         *
         * And that copy button is now visible at rest, which the theme does not make it: it ships
         * the button at `opacity: 0`, fading it to 0.4 only while the block is hovered, so the one
         * line this page exists to hand over carried no visible affordance at all. Undoing that
         * took a four-class selector rather than a bare declaration, because the theme has two
         * rules to beat and the block-hover one is (0,3,1) — the arithmetic, and the two global
         * class names it leans on, are written beside the rule in `src/css/custom.css`.
         */}
        <CodeBlock language="sh" className="landing__install">
          npx @zomarit/stamity init
        </CodeBlock>

        {/*
         * Rendered empty at mount, not created when the message arrives: a live region inserted
         * together with its text is the classic way to get silence. `polite` because this is a
         * status and not an alert; `aria-atomic` so the whole phrase is read rather than the
         * diff. `.landing__sr-only` is this page's own visually-hidden class, already carrying
         * the repo link's new-tab cue — clipped rather than hidden, so it stays in the
         * accessibility tree, which is the one requirement a live region cannot do without.
         */}
        <p className="landing__sr-only" aria-live="polite" aria-atomic="true" ref={statusRef} />

        {/*
         * Both icons below are Primer Octicons (github/primer/octicons, MIT licence) at their 16px
         * cuts — `arrow-right-16` trailing the first link, `mark-github-16` leading the second —
         * inlined as their own path data so the page takes no icon dependency and makes no extra
         * request. Each is `aria-hidden` and `fill="currentColor"`: it repeats the label beside it,
         * so it adds nothing to the accessible name and invents no colour. The mark is the
         * octicon's unmodified geometry and is never animated, resized or recoloured, which is
         * what GitHub's logo terms require of it.
         */}
        <div className="landing__links">
          <Link
            className="button button--primary button--lg landing__link landing__link--start"
            to="/docs/getting-started"
          >
            Start here
            <svg aria-hidden="true" fill="currentColor" viewBox="0 0 16 16">
              <path d="M8.22 2.97a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042l2.97-2.97H3.75a.75.75 0 0 1 0-1.5h7.44L8.22 4.03a.75.75 0 0 1 0-1.06Z" />
            </svg>
          </Link>
          <Link
            className="button button--secondary button--lg landing__link landing__link--repo"
            href="https://github.com/zomarit/stamity"
          >
            <svg aria-hidden="true" fill="currentColor" viewBox="0 0 16 16">
              <path d="M6.766 11.328c-2.063-.25-3.516-1.734-3.516-3.656 0-.781.281-1.625.75-2.188-.203-.515-.172-1.609.063-2.062.625-.078 1.468.25 1.968.703.594-.187 1.219-.281 1.985-.281.765 0 1.39.094 1.953.265.484-.437 1.344-.765 1.969-.687.218.422.25 1.515.046 2.047.5.593.766 1.39.766 2.203 0 1.922-1.453 3.375-3.547 3.64.531.344.89 1.094.89 1.954v1.625c0 .468.391.734.86.547C13.781 14.359 16 11.53 16 8.03 16 3.61 12.406 0 7.984 0 3.563 0 0 3.61 0 8.031a7.88 7.88 0 0 0 5.172 7.422c.422.156.828-.125.828-.547v-1.25c-.219.094-.5.156-.75.156-1.031 0-1.64-.562-2.078-1.609-.172-.422-.36-.672-.719-.719-.187-.015-.25-.093-.25-.187 0-.188.313-.328.625-.328.453 0 .844.281 1.25.86.313.452.64.655 1.031.655s.641-.14 1-.5c.266-.265.47-.5.657-.656" />
            </svg>
            GitHub
            {/*
             * The href is absolute, so `Link` renders this as `target="_blank"` — and the navbar's
             * own GitHub item announces that with the theme's external-link icon while this button
             * announced it with nothing. The cue is text, clipped by `.landing__sr-only`: it joins
             * the accessible name rather than sitting beside the mark, which GitHub's logo terms
             * would not have it decorated with a second glyph anyway.
             *
             * The words are the theme's, not this page's. The navbar's icon carries
             * `aria-label="(opens in new tab)"` through `translate()`
             * (`@docusaurus/theme-classic/lib/theme/Icon/ExternalLink/index.js:18-22`), so this
             * span spells the same phrase and the two links announce the same tab identically
             * rather than in two wordings a reader has to notice are one thing.
             */}
            <span className="landing__sr-only"> (opens in new tab)</span>
          </Link>
        </div>
      </main>
    </Layout>
  );
}
