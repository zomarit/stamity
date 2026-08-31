import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import CodeBlock from '@theme/CodeBlock';
import Layout from '@theme/Layout';
import type {ReactNode} from 'react';

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

  return (
    <Layout title={siteConfig.title} description={siteConfig.tagline}>
      <main className="landing">
        <h1 className="landing__title">{siteConfig.title}</h1>
        <p className="landing__pitch">{siteConfig.tagline}</p>

        {/*
         * The theme's own code block, not a bare `pre`, and the reason is the copy button: this is
         * the one line on the site a reader is meant to take away with them, and a hand-rolled
         * `pre` is the only place on the whole site where copying is a manual selection. `sh`
         * matches the fence `docs/getting-started.md` uses for the same command, so the two render
         * identically. `className` lands on the block's outer container — see `.landing__install`
         * in `src/css/custom.css` for what is adjusted there and what is left to the theme.
         */}
        <CodeBlock language="sh" className="landing__install">
          npx @zomarit/stamity init
        </CodeBlock>

        <div className="landing__links">
          <Link className="button button--primary button--lg" to="/docs/getting-started">
            Start here
          </Link>
          <Link
            className="button button--secondary button--lg"
            href="https://github.com/zomarit/stamity"
          >
            GitHub
          </Link>
        </div>
      </main>
    </Layout>
  );
}
