import {existsSync, statSync} from 'node:fs';
import {dirname, relative, resolve, sep} from 'node:path';

/**
 * Rewrite the repo-relative links that leave `docs/` to the file they name on GitHub.
 *
 * THE COLLISION THIS RESOLVES. Every page in `docs/` is written to be read in the repository
 * first — that is the architecture, and the hand-page contract in `test/docsPages.test.ts`
 * requires repo-relative links for it. Some of those links point UP and OUT of the docs tree:
 * `../SECURITY.md`, `../packs/ops/`. Inside the tree they are correct. On the site they resolve
 * to `/SECURITY.md`, a route that does not exist and never will, because publishing a second
 * copy of the repository is exactly the duplication this site is arranged to avoid.
 *
 * The two obvious answers are both worse than this one. Rewriting the pages to carry site URLs
 * would break them where they are primarily read. Turning `onBrokenLinks` down to `warn` would
 * retire the check for every link, including the ones that aim at a doc page and miss — which
 * are real defects and the reason to have the check at all.
 *
 * So the rewrite happens at render time, and only for links that have somewhere real to go:
 *
 *   inside `docs/`     left alone — Docusaurus resolves it to a route and checks it.
 *   outside `docs/`,
 *     exists in tree   rewritten to this repository's GitHub blob/tree URL for that path.
 *     missing          LEFT ALONE, deliberately, so `onBrokenLinks: 'throw'` reports it. A link
 *                      to a repository file that is not there is a defect in the page, and this
 *                      plugin must not be the thing that hides it.
 *   absolute, or
 *     site-rooted, or
 *     a bare anchor    left alone — not this plugin's business.
 *
 * It runs in `beforeDefaultRemarkPlugins` so Docusaurus's own link resolution never sees an
 * out-of-tree link in the first place.
 */

interface Options {
  /** Absolute path of the directory the docs plugin reads. */
  readonly docsDir: string;
  /** Absolute path of the repository root the rewritten URLs are relative to. */
  readonly repoRoot: string;
  /** The repository's GitHub home, without a trailing slash. */
  readonly repoUrl: string;
}

interface LinkNode {
  type: string;
  url?: string;
  children?: LinkNode[];
}

interface VFileLike {
  path?: string;
}

/** `true` when `target` is `root` itself or lives under it. Separator-anchored, so `docs-old` is not `docs`. */
function isInside(target: string, root: string): boolean {
  return target === root || target.startsWith(root.endsWith(sep) ? root : root + sep);
}

/** Every `link` and `definition` node in the tree, walked without a unist dependency. */
function eachLink(node: LinkNode, visit: (node: LinkNode) => void): void {
  if (node.type === 'link' || node.type === 'definition') visit(node);
  for (const child of node.children ?? []) eachLink(child, visit);
}

export default function repoLinks(options: Options) {
  const {docsDir, repoRoot, repoUrl} = options;

  return function transformer(tree: LinkNode, file: VFileLike): void {
    const from = file.path;
    if (typeof from !== 'string' || from === '') return;

    eachLink(tree, (node) => {
      const url = node.url;
      if (typeof url !== 'string' || url === '') return;
      // A scheme, a protocol-relative URL, or a site-absolute path: not a repo-relative link.
      if (/^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith('//') || url.startsWith('/')) return;

      const split = /^([^#?]*)([#?].*)?$/.exec(url);
      const pathPart = split?.[1] ?? '';
      const suffix = split?.[2] ?? '';
      // A bare `#anchor` or `?query` addresses this page, not another file.
      if (pathPart === '') return;

      const target = resolve(dirname(from), pathPart);
      if (isInside(target, docsDir)) return;
      if (!isInside(target, repoRoot)) return;
      if (!existsSync(target)) return;

      const relPath = relative(repoRoot, target).split(sep).join('/');
      const directory = statSync(target).isDirectory();
      node.url = directory
        ? `${repoUrl}/tree/main/${relPath}/${suffix}`
        : `${repoUrl}/blob/main/${relPath}${suffix}`;
    });
  };
}
