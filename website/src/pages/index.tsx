import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
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

        <pre className="landing__install">
          <code>npx @zomarit/stamity init</code>
        </pre>

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
