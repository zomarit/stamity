import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { TRUST_TIERS } from "../src/pack/trust.ts";
import { CONTENT_CLASSES } from "../src/types/content.ts";
import { CORPUS_ROOT, loadCorpusIndex } from "./corpus/harness.ts";

/**
 * The gate on the ten hand-written pages: three at the root, seven guides
 * under `docs/`.
 *
 * The rest of `docs/` is generated and drift-tested against its renderer; these
 * ten are typed by a human, so the only guard is this file.
 * It asserts the properties a rewrite could silently break — the public
 * opening surviving a reflow, the ≤150-line budget, links that stay inside the
 * tree or inside this repository's own GitHub home, no bare domain, no contact
 * address — and re-runs the leak gate so a leaked reserved name fails here too,
 * not only in CI.
 *
 * The guides joined this bucket when they landed rather than getting a second,
 * weaker suite of their own. A published page is a published page: the
 * properties below are what make one checkable, and a guide exempt from them is
 * a guide nobody can tell is stale. What they do NOT inherit are README's line
 * budget and its opening shape, which are claims about one page rather than
 * about the bucket.
 *
 * Link targets resolve against the page's OWN directory, not the repository
 * root. `docs/troubleshooting.md` links its neighbour as `cli-reference.md`,
 * which is how the page reads correctly in the tree and on the published site;
 * resolving every target from the root would have declared each of those
 * missing and pushed the guides toward root-absolute links the rule below
 * refuses.
 *
 * The absolute-URL rule is an ALLOWLIST, not a ban. A published page has two
 * addresses it must be able to print — the advisory form and the issue tracker
 * — and both live under one URL prefix, so the rule is that prefix and nothing
 * else. A ban would have forced the security page to describe its own reporting
 * channel in prose, which is how a reporter ends up guessing.
 *
 * Link EXISTENCE covers every non-anchor target. It used to exempt four
 * generated pages that had not shipped yet, which suppressed the check on four
 * of about nine targets; all four have shipped, and an exemption kept past its
 * reason means renaming one of them breaks README and passes both suites.
 *
 * Two properties are asserted on all ten pages because the hand bucket is
 * DEFINED by them: a currency header naming what the page was verified against,
 * and a published re-open trigger — a falsifiable condition under which the page
 * must be rewritten. A hand page without them is a page nobody can tell is
 * stale. SECURITY.md carries a third, in two halves: every control it claims
 * names an enclosing symbol that exists in the file it names, AND something
 * under `src/` references that symbol. Existence alone is what let the tool-
 * allowlist row cite an in-process check with no production caller while
 * calling the control "enforced in-process and by the emitted guard" — a
 * symbol that exists and nothing calls is how a page overstates a defence.
 *
 * One class of claim on these pages is not a matter of taste but of arithmetic:
 * README's map row counts the corpus, and its client-surface prose describes
 * what the adapters emit. Hand-kept numbers about a growing corpus go stale
 * silently — the specialist tier took agents from 7 to 10 and the row still
 * read 7 — so the last describe block derives those facts from the mechanisms
 * themselves (the content catalog's own walk, the generated capability matrix)
 * and holds the prose to them.
 */

const REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));

const README = "README.md";
const SECURITY = "SECURITY.md";
const CONTRIBUTING = "CONTRIBUTING.md";

/**
 * The two community pages. They are root files, and they are deliberately NOT members of
 * `PAGES`.
 *
 * The hand bucket is defined by properties these two do not share. GOVERNANCE.md names the CI
 * gates a merge waits on, and no assertion here can tell whether that list still matches
 * `.github/workflows/` — its own re-open trigger says so and sends a maintainer to read the
 * workflow. CODE_OF_CONDUCT.md is the Contributor Covenant, whose licence requires attribution
 * links to contributor-covenant.org: the one place in this tree where an outside URL is a
 * licence term rather than a leak, and precisely what the `PAGES` absolute-URL allowlist exists
 * to reject. Putting either in `PAGES` would mean weakening a rule that is right for the three
 * pages it was written for.
 *
 * What does bind them is the map: README links both, so the link-resolution assertion below
 * covers their existence. The leak gate covers their content, over the whole tree.
 */
const GOVERNANCE = "GOVERNANCE.md";
const CODE_OF_CONDUCT = "CODE_OF_CONDUCT.md";

/** The three hand pages at the repository root, by repo-relative path. */
const PAGES: readonly string[] = [README, SECURITY, CONTRIBUTING];

// Declared in path order, which is not the order GUIDES reads in: this block is a lookup and
// the array below is the sidebar's sequence, so the customization guide sits first here and
// fourth there, and the workspaces guide last here and fifth there.
const CUSTOMIZATION = "docs/customization.md";
const GETTING_STARTED = "docs/getting-started.md";
const MIGRATION = "docs/migration.md";
const PACKS_AND_TRUST = "docs/packs-and-trust.md";
const TROUBLESHOOTING = "docs/troubleshooting.md";
const WORKING_WITH_STAMITY = "docs/working-with-stamity.md";
const WORKSPACES = "docs/workspaces.md";

/**
 * The seven hand-written guides under `docs/`.
 *
 * Everything else in that directory is rendered from code and carries a
 * "GENERATED FILE, rewrite it with X" header; these seven are the only pages
 * there a human types, which is exactly the line the hand bucket is drawn on.
 */
const GUIDES: readonly string[] = [
  GETTING_STARTED,
  MIGRATION,
  WORKING_WITH_STAMITY,
  CUSTOMIZATION,
  WORKSPACES,
  PACKS_AND_TRUST,
  TROUBLESHOOTING,
];

/**
 * The guides README rows — every guide but one.
 *
 * The migration guide is published and unlisted, and that is a decision rather than an
 * oversight: it keeps the route the predecessor's sunset material promises (pinned in
 * `test/ci/docsSite.test.ts`), and it is off the site's navigation (`website/sidebars.ts`) and
 * off this map because the readers who need it arrive already holding a link, while a reader who
 * arrives here has no predecessor setup to move off. `llms.txt` still indexes it — an agent
 * reading the tree is given the whole tree — so "reachable" is asserted against the index for
 * every guide and against the map for these.
 */
const MAPPED_GUIDES: readonly string[] = GUIDES.filter((page) => page !== MIGRATION);

/** Every hand-written page. The properties below are asserted on all of them. */
const HAND_PAGES: readonly string[] = [...PAGES, ...GUIDES];

/** README's hard budget, per the hand-page posture (≤150 lines). */
const README_MAX_LINES = 150;

/**
 * The product, its installable package, and the owner the pages name.
 *
 * The owner is lowercase, and it is asserted that way rather than case-insensitively: the brand is
 * written `zomarit` in running prose the way `npm` is, so a capitalised one on a published page is
 * the drift this catches, not a spelling this should tolerate.
 */
const PRODUCT = "stamity";
const SCOPED_PACKAGE = "@zomarit/stamity";
const OWNER = "zomarit";

/**
 * The prefix every user-invocable command and skill is emitted under.
 *
 * It used to be derivable — the product name plus a hyphen — and the pages were checked that way.
 * The 1.0.0 re-cut broke that derivation on purpose: commands and skills moved to `st-` while the
 * agents, the rules, the state directory and the package all kept `stamity-`, so the two are now
 * different strings and a page that names a touchpoint has to be held to THIS one. Deriving it
 * from `PRODUCT` again would pass on `/stamity-pr-resolve`, which is no longer a command anyone
 * can invoke.
 */
const COMMAND_PREFIX = "st-";

/** The install line a first-time reader runs — README's opening must show it. */
const INSTALL_COMMAND = `npx ${SCOPED_PACKAGE} init`;

/** The private disclosure form SECURITY.md sends a reporter to. */
const ADVISORY_URL = "https://github.com/zomarit/stamity/security/advisories/new";

/**
 * Reserved names, assembled from fragments so this file is scanned by the leak
 * gate under the same rules as every other file — a test that spelled them out
 * would need its own exemption to pass its own assertion. The retired working
 * name joined the list at 1.0.0: it is the one name that appeared throughout
 * this tree, so a page that still carries it is the likeliest leak of the set.
 */
const RESERVED_TOKENS: readonly string[] = [
  ["tess", "ity"].join(""),
  ["apris", "ity"].join(""),
  ["h4t", "cher"].join(""),
  ["hat", "ch3r"].join(""),
  ["nes", "tor"].join(""),
];

/**
 * The one (page, token) PAIR carved out of the rule above.
 *
 * The migration guide cannot be written without the predecessor's name: a
 * reader arrives from that project, searches for that word, and a page that
 * described the old setup in euphemisms is a page nobody finds. The carve-out
 * is a pair rather than a page-level exemption, so that guide is still held to
 * the other four reserved names and every other page is still held to all five.
 *
 * It is COUPLED to the leak gate rather than merely parallel to it — the same
 * path is the gate's only `docs/` allowlist entry, asserted below — because two
 * independent exemptions that both decide "which page is special" are two
 * things that can drift into disagreeing.
 */
const PREDECESSOR_TOKEN = ["hat", "ch3r"].join("");
const PREDECESSOR_NAME_PAGE = MIGRATION;

/** Every absolute URL on a page, with sentence punctuation trimmed off the tail. */
const ABSOLUTE_URLS = /[a-z][a-z0-9+.-]*:\/\/[^\s<>()[\]`"']+/gi;

/**
 * The ONE absolute-URL family these pages may name: this repository's own
 * GitHub home, and nothing above or beside it. `zomarit/stamityx` and
 * `github.com/other/stamity` both fail — the boundary is a path segment, not a
 * prefix match.
 */
const ALLOWED_URL = /^https:\/\/github\.com\/zomarit\/stamity(?:\/[\w./-]*)?$/;

/** A bare domain — the shape a support site or product URL would arrive as. */
const BARE_DOMAIN = /\b[a-z0-9][a-z0-9-]*\.(?:com|io|dev|org|net|ai|app|co|xyz)\b/i;

/** An email address — the pages publish a form, never an inbox. */
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;

/**
 * The currency header, in either of its two forms. A commit sha is what a page
 * cites once there is history to cite; the release cut is what the first cut
 * has instead, and both name a point a reader can go and check.
 */
const CURRENCY_HEADER =
  /<!--\s*HAND-WRITTEN PAGE — verified against the tree at (?:commit [0-9a-f]{7,40}|the \d+\.\d+\.\d+ release cut \((\d{4}-\d{2}-\d{2})\))\./;

/**
 * The date this cut re-verified the hand bucket against.
 *
 * `CURRENCY_HEADER` proves a page carries a date. It cannot prove the date is THIS one, and a page
 * rewritten under an unmoved date is exactly the false attestation the header exists to prevent —
 * so the shape check alone let a re-cut ship seven pages all still claiming the previous cut.
 *
 * It is deliberately NOT required of every page. A page nobody re-read this cut keeps the date it
 * was actually verified on; moving it in sympathy manufactures the same false attestation from the
 * other direction. What is required is the pair below: the bucket's NEWEST date is this constant,
 * so the constant has to move on the next cut or the assertion fails, and no page claims a
 * verification later than the cut it shipped in.
 */
const RELEASE_CUT_DATE = "2026-08-30";

/** Absolute URLs removed, so the domain and link rules read only what is left. */
const withoutAllowedUrls = (text: string): string => text.replace(ABSOLUTE_URLS, " ");

/** `[text](target)` — the only link form these pages use. */
const MARKDOWN_LINK = /\[[^\]]*\]\(([^)]+)\)/g;

/** Every target README links. All of them exist; a broken one is a regression. */
const README_LINK_TARGETS: readonly string[] = [
  "content/",
  "packs/",
  "docs/capability-matrix.md",
  "docs/cli-reference.md",
  "docs/configuration.md",
  "docs/reference/",
  "llms.txt",
  SECURITY,
  CONTRIBUTING,
  // The community surface joined the map at publication. Listing both here is what turns
  // "resolves every link target it names" into a guard on their existence: drop either file
  // and README keeps a row pointing at nothing, which is the failure this list is for.
  GOVERNANCE,
  CODE_OF_CONDUCT,
  // The guides joined the map at publication, for the same reason: a row is
  // what makes a page reachable, and a guide the README does not name is a
  // page only the index knows about. All of them but the migration guide —
  // see MAPPED_GUIDES for why that one is reached from elsewhere.
  ...MAPPED_GUIDES,
];

/** The generated client-capability page — the mechanism README's surface prose must agree with. */
const CAPABILITY_MATRIX = "docs/capability-matrix.md";

/**
 * README's map row for the corpus, matched by its `content/` link so the
 * assertion binds that row and not a digit elsewhere on the page. Capture 1 is
 * the row's description cell.
 */
const CORPUS_ROW = /^\|\s*\[`content\/`]\(content\/\)\s*\|([^|]*)\|/m;

/** `10 agents` — one count and the class noun it counts, inside the corpus row. */
const COUNTED_NOUN = /(\d+)\s+([a-z]+)/g;

/** Codex's declared command-surface cap, read out of the generated matrix. */
const CODEX_COMMAND_SURFACE = /^\| `command-surface` \| ([^|]*)\|/m;

const read = (relPath: string): string => readFileSync(join(REPO_ROOT, relPath), "utf-8");

const lines = (text: string): string[] => text.replace(/\n$/, "").split("\n");

/**
 * A page's own text, with a leading YAML frontmatter block dropped.
 *
 * Frontmatter is machine metadata addressed to the site generator, not part of the page a
 * reader opens, so the head budget below must not be spent on it. `docs/migration.md` carries
 * three lines of it — the `slug` that publishes the page under the predecessor's name, which is
 * a URL the filename itself cannot carry — and counting those against the six-line head would
 * hold that one page to a shorter header than its siblings for a reason the contract never made.
 * The six other `docs/` guides carry frontmatter too, a two-line `title:` block Docusaurus
 * reads for the sidebar label and the document title; "every sidebar-listed hand page declares
 * its H1 as its title" below is what holds that block to the page it labels.
 */
const afterFrontmatter = (text: string): string =>
  /^---\r?\n/.test(text) ? text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "") : text;

const linkTargets = (text: string): string[] =>
  [...text.matchAll(MARKDOWN_LINK)].map((match) => match[1] ?? "");

/** A relative target resolved from the linking page's own directory. */
const resolveTarget = (page: string, target: string): string =>
  join(REPO_ROOT, dirname(page), target);

/** Fenced blocks on a page — the lines a reader copies and runs. */
const fencedBlocks = (text: string): string[] =>
  text.split("```").filter((_, index) => index % 2 === 1);

/** Singular of a class noun read out of prose — every corpus class pluralizes with `s`. */
const singular = (noun: string): string => (noun.endsWith("s") ? noun.slice(0, -1) : noun);

/**
 * What the corpus holds per class, keyed by singular class noun.
 *
 * Counted through the engine's own catalog walk, not by listing files: the
 * catalog is what decides an artifact IS one. A skill is its directory, so
 * `content/skills/` holds 8 skills across 18 markdown files, and a raw file
 * count would state 18. The charter is the one piece of corpus content the
 * catalog does not index — it is not an addressable class — so it is counted
 * off disk to keep it in the same map.
 */
async function corpusCounts(): Promise<Map<string, number>> {
  const index = await loadCorpusIndex();
  const counts = new Map<string, number>();
  for (const klass of CONTENT_CLASSES) {
    counts.set(klass, index.items.filter((item) => item.type === klass).length);
  }
  const charters = readdirSync(join(CORPUS_ROOT, "charter")).filter((name) => name.endsWith(".md"));
  counts.set("charter", charters.length);
  return counts;
}

describe("hand pages", () => {
  // Renamed on each growth of the bucket — "all seven" when the workflow guide joined, "all
  // eight" when the customization guide did, "all nine" when the workspaces guide did: the name
  // states the membership count, and the loop below is unchanged through all of them and still
  // runs over every member.
  it("all ten exist and carry real content", () => {
    for (const page of HAND_PAGES) {
      expect(existsSync(join(REPO_ROOT, page)), `${page} is missing`).toBe(true);
      expect(read(page).trim().length, `${page} is empty`).toBeGreaterThan(500);
    }
  });

  it("links inside the tree, or inside this repository's own GitHub home", () => {
    for (const page of HAND_PAGES) {
      const text = read(page);

      // Every absolute URL on the page is one of ours, path segment for path
      // segment. Publication earned these pages exactly two outside addresses;
      // it did not earn a general licence to link out.
      for (const url of text.match(ABSOLUTE_URLS) ?? []) {
        const trimmed = url.replace(/[.,;:]+$/, "");
        expect(trimmed, `${page} links outside the repository's GitHub home`).toMatch(ALLOWED_URL);
      }

      // Domains and addresses are read from what is left once those are gone,
      // so `github.com` inside an allowed URL is not a bare domain and does not
      // buy a page the right to name a second host in prose.
      const rest = withoutAllowedUrls(text);
      expect(BARE_DOMAIN.exec(rest)?.[0] ?? "", `${page} carries a bare domain`).toBe("");
      expect(EMAIL.exec(rest)?.[0] ?? "", `${page} carries an email address`).toBe("");

      for (const target of linkTargets(text)) {
        if (ALLOWED_URL.test(target)) continue;
        expect(target, `${page} link is not repo-relative`).not.toMatch(/^[a-z][a-z0-9+.-]*:/i);
        expect(target, `${page} link is root- or protocol-absolute`).not.toMatch(/^\//);
        if (target.startsWith("#")) continue;
        // Resolved from the LINKING page's directory, which is where a reader
        // and the published site both resolve it from.
        expect(
          existsSync(resolveTarget(page, target)),
          `${page} links missing ${target}`,
        ).toBe(true);
      }
    }
  });

  it("names the product and the scoped package", () => {
    // The positive half: a published page that never says what the thing is
    // called, or what to install to get it, is a page a reader cannot act on.
    const readme = read(README);
    expect(readme, "README does not name the product").toContain(PRODUCT);
    expect(readme, "README does not name the installable package").toContain(SCOPED_PACKAGE);
    expect(readme, "README does not name the owner").toContain(OWNER);

    // The negative half outlives the rename: these pages are the public face,
    // so a retired or predecessor name surfacing here is the leak that matters
    // most. The leak gate below covers the tree; this covers the face. One
    // (page, token) pair is carved out and asserted live under "the guides".
    for (const page of HAND_PAGES) {
      const text = read(page).toLowerCase();
      for (const token of RESERVED_TOKENS) {
        if (page === PREDECESSOR_NAME_PAGE && token === PREDECESSOR_TOKEN) continue;
        expect(text.includes(token), `${page} names a reserved token`).toBe(false);
      }
    }
  });

  it("carries a currency header and a published re-open trigger", () => {
    // The hand bucket is DEFINED by these two: a page nobody can date and nobody
    // can falsify is a page nobody can tell is stale. The generated half of the
    // split implemented its own version of this — a "GENERATED FILE, rewrite it
    // with X" header — and the hand half shipped with neither.
    for (const page of HAND_PAGES) {
      const head = lines(afterFrontmatter(read(page))).slice(0, 6).join("\n");

      expect(head, `${page} has no currency header`).toMatch(CURRENCY_HEADER);
      // Falsifiable, not aspirational: the trigger names a condition a reader can
      // check, and the suite that would catch it.
      expect(head, `${page} publishes no re-open trigger`).toMatch(/Re-open when:/);
      expect(head, `${page}'s re-open trigger names no check`).toMatch(/test\/docsPages\.test\.ts/);
    }
  });

  it("dates the bucket at this cut, and no page later than it", () => {
    // The half of the currency header the shape check cannot reach. See RELEASE_CUT_DATE for why
    // the pin is "the newest date is this one" rather than "every page carries this one".
    const dated = HAND_PAGES.map((page) => {
      const head = lines(afterFrontmatter(read(page))).slice(0, 6).join("\n");
      return [page, CURRENCY_HEADER.exec(head)?.[1]] as const;
    }).filter((entry): entry is readonly [string, string] => entry[1] !== undefined);

    expect(dated.length, "no hand page states a release-cut date to check").toBeGreaterThan(0);

    for (const [page, date] of dated) {
      // ISO-8601 sorts lexicographically, which is most of why the header carries that shape.
      expect(
        date <= RELEASE_CUT_DATE,
        `${page} attests to ${date}, later than the ${RELEASE_CUT_DATE} cut it ships in`,
      ).toBe(true);
    }

    expect(
      dated.map(([, date]) => date).toSorted().at(-1),
      `no hand page was re-verified at the ${RELEASE_CUT_DATE} cut — move the banner date on the ` +
        `pages this cut rewrote, or move RELEASE_CUT_DATE to the cut that actually happened`,
    ).toBe(RELEASE_CUT_DATE);
  });

  it("every sidebar-listed hand page declares its H1 as its title", () => {
    // Docusaurus reads the `title:` frontmatter key for the sidebar label AND the document
    // title; a page whose H1 and frontmatter title drift apart shows one heading in the sidebar
    // and a different one on the page. `migration.md` is excluded on purpose — it carries only
    // a `slug:` block (see MAPPED_GUIDES) and is off the sidebar, so it has no title to check.
    let checked = 0;
    for (const page of MAPPED_GUIDES) {
      const text = read(page);

      const frontmatter = /^---\r?\ntitle: (.+?)\r?\n---\r?\n/.exec(text);
      expect(frontmatter, `${page} carries no title frontmatter for the sidebar`).not.toBeNull();
      const title = frontmatter?.[1] ?? "";

      const h1 = /^# (.+)$/m.exec(afterFrontmatter(text))?.[1];
      expect(h1, `${page} has no H1 to check its frontmatter title against`).toBeDefined();

      expect(title, `${page}'s frontmatter title diverges from its own H1`).toBe(h1);
      checked += 1;
    }
    // Vacuity guard: an empty or mis-filtered MAPPED_GUIDES would pass the loop above having
    // asserted nothing.
    expect(checked, "no hand page under docs/ was checked for a title").toBeGreaterThan(0);
    expect(checked, "MAPPED_GUIDES filtered out a page the loop should have checked").toBe(
      MAPPED_GUIDES.length,
    );
  });

  it("passes the leak gate", () => {
    const gate = join(REPO_ROOT, "scripts/leak-gate.mjs");
    const result = spawnSync(process.execPath, [gate], {
      cwd: REPO_ROOT,
      encoding: "utf-8",
    });
    const detail =
      result.status === 0 ? "" : `exit ${String(result.status)}\n${result.stdout}${result.stderr}`;
    expect(detail).toBe("");
  });
});

describe("README", () => {
  it("opens on the public title, a pitch, and the install command", () => {
    // What replaced the byte-pinned PRIVATE banner. The banner was pinned line
    // for line because it was a legal posture; the opening that replaced it is
    // pinned by SHAPE, because a first-time reader needs three things off the
    // top — what this is called, what it does, and what to type — and a rewrite
    // that drops any of them is the failure this guards. Anchored to the H1, so
    // the currency header above it can grow without moving the assertion.
    const readmeLines = lines(read(README));

    const title = readmeLines.indexOf(`# ${PRODUCT}`);
    expect(title, "README has no title").toBeGreaterThanOrEqual(0);
    expect(readmeLines[title + 1]).toBe("");

    const pitch = readmeLines[title + 2] ?? "";
    // A blockquote directly under the title is the shape the retired private
    // banner had, and the shape a new one would arrive in.
    expect(pitch.startsWith(">"), "README opens on a banner rather than a pitch").toBe(false);
    expect(pitch.length, "README states no pitch under its title").toBeGreaterThan(0);
    expect(pitch, "README's opening line does not name the owner").toContain(OWNER);

    expect(read(README), "README never shows the install command").toContain(INSTALL_COMMAND);
  });

  it("leads on a theme-aware banner whose sources are both in the tree", () => {
    // The banner is HTML, so the markdown link assertions below cannot see it: a wordmark
    // renamed or moved under `website/static/img/` would leave a broken image at the top of the
    // most-read page in the repository with nothing failing. Both sources are resolved here.
    const text = read(README);

    const sources = [...text.matchAll(/(?:src|srcset)="([^"]+)"/g)].map((match) => match[1] ?? "");
    expect(sources.length, "README shows no banner").toBeGreaterThanOrEqual(2);
    for (const source of sources) {
      expect(
        existsSync(join(REPO_ROOT, source)),
        `README's banner shows missing ${source}`,
      ).toBe(true);
    }

    // The dark source is an enhancement; the `img` is what every surface that does not
    // implement `<picture>` — a plain markdown viewer, the npm page — actually renders, and
    // its `alt` is what a reader with no images at all gets instead of the mark.
    expect(text, "README's banner has no theme-aware source").toMatch(
      /<source[^>]*prefers-color-scheme: dark[^>]*srcset="/,
    );
    expect(text, "README's banner has no fallback image with alt text").toMatch(
      /<img[^>]*\balt="stamity"/,
    );
  });

  it("stays within the hand-page line budget", () => {
    expect(lines(read(README)).length).toBeLessThanOrEqual(README_MAX_LINES);
  });

  // Renamed when the workspace verb joined the advertised surface — "seven verbs" until then:
  // the name states the count, and the array below is what the assertion actually reads.
  //
  // This is the SECOND hand-maintained copy of the surface, the getting-started case below
  // holding the first. Both are literal lists rather than derivations from `COMMANDS`, so a verb
  // that joins the CLI and not these two arrays leaves both pages understating the surface with
  // nothing failing — which is exactly how README went on saying "seven verbs" while `workspace`
  // shipped. A verb lands in `src/cli.ts` and in both arrays, in that order.
  it("states the command surface — eight verbs plus the plumbing verb", () => {
    const text = read(README);
    for (const command of [
      "init",
      "sync",
      "check",
      "validate",
      "add",
      "config",
      "workspace",
      "clean",
    ]) {
      expect(text, `README omits \`${command}\``).toContain(`\`${command}\``);
    }
    expect(text).toContain("`learn`");
  });

  it("links the map and the local-use entry points", () => {
    const text = read(README);
    const targets = new Set(linkTargets(text));
    for (const target of README_LINK_TARGETS) {
      expect(targets.has(target), `README does not link ${target}`).toBe(true);
    }
    expect(text).toContain("npm run check");
    expect(text).toContain("node dist/cli.js check");
  });

  it("resolves every link target it names", () => {
    // No exemption list. The four generated pages it used to skip have shipped,
    // and a skip kept past its reason hides a rename from both suites.
    const checked: string[] = [];
    for (const target of linkTargets(read(README))) {
      if (target.startsWith("#")) continue;
      checked.push(target);
      expect(existsSync(join(REPO_ROOT, target)), `README links missing ${target}`).toBe(true);
    }
    expect(checked.length, "README stopped linking anything").toBeGreaterThanOrEqual(
      README_LINK_TARGETS.length,
    );
  });
});

describe("README corpus claims", () => {
  it("names every corpus class and states the count the catalog indexes", async () => {
    const expected = await corpusCounts();
    for (const [noun, count] of expected) {
      expect(count, `the corpus holds no ${noun}, so its count asserts nothing`).toBeGreaterThan(0);
    }

    const row = CORPUS_ROW.exec(read(README))?.[1] ?? "";
    expect(row, "README has no `content/` map row to read counts from").not.toBe("");

    const stated = new Map<string, number>();
    for (const [, digits, noun] of row.matchAll(COUNTED_NOUN)) {
      stated.set(singular(noun ?? ""), Number(digits ?? ""));
    }

    // Set equality in both directions. A class dropped from the sentence fails,
    // and so does one the corpus does not have — the row used to count hook
    // scripts, which are generated from code and were never corpus content.
    expect([...stated.keys()].toSorted()).toEqual([...expected.keys()].toSorted());
    for (const [noun, count] of expected) {
      expect(stated.get(noun), `README states the wrong ${noun} count`).toBe(count);
    }
  });

  it("keeps hook scripts out of the corpus and cites where they are generated", () => {
    expect(
      existsSync(join(CORPUS_ROOT, "hooks")),
      "hooks became corpus content — README's map row and its hook note both need updating",
    ).toBe(false);

    const source = "src/hooks/scripts.ts";
    expect(existsSync(join(REPO_ROOT, source)), `README cites missing ${source}`).toBe(true);
    expect(read(README)).toContain(source);
  });

  it("says Codex has no command surface only while its adapter declares none", () => {
    const matrix = read(CAPABILITY_MATRIX);
    const sectionStart = matrix.indexOf("### `codex`");
    expect(sectionStart, "capability matrix has no codex section").toBeGreaterThanOrEqual(0);

    const declared = (CODEX_COMMAND_SURFACE.exec(matrix.slice(sectionStart))?.[1] ?? "").trim();
    expect(declared, "codex declares no command-surface cap").not.toBe("");
    expect(declared, "codex gained a command surface — README's prose is now wrong").toMatch(
      /^none/,
    );
    expect(read(README)).toMatch(/Codex has no\s+repository-level command home/);
  });
});

const SRC_ROOT = join(REPO_ROOT, "src");

/** Every `.ts` file under `src/`, absolute. */
function sourceFiles(dir: string = SRC_ROOT, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const absolute = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(absolute, out);
    else if (entry.name.endsWith(".ts")) out.push(absolute);
  }
  return out;
}

/** Source with comments removed — a `{@link name}` mention is not a use. */
const withoutComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, " ");

/**
 * Repo-relative files that reference `symbol` outside comments and outside its
 * own declaration — the call-graph answer to "does anything here use this".
 *
 * REFERENCES, not importers, and the difference is the point: the declaring
 * module counts, because a symbol reached only from a wired sibling in the same
 * file is still reached — `BANNED_LIFECYCLE_SCRIPTS` feeds a set one screen
 * below it and never leaves `manifest.ts`. An importer scan would read four of
 * the table's live controls as dead. What is excluded is the declaration itself
 * and every doc comment naming it, which is the exact evidence a symbol-
 * existence check mistakes for use.
 *
 * `test/tools/allowlist.test.ts` keeps its own scan for a narrower question —
 * which modules IMPORT the check — so the two are separate on purpose.
 */
function referencesTo(symbol: string, declaredIn: string): string[] {
  const declaration = new RegExp(
    String.raw`(?:export\s+)?(?:async\s+)?(?:function|const|class|interface|type|enum)\s+${symbol}\b`,
    "g",
  );
  const found: string[] = [];
  for (const file of sourceFiles()) {
    const relPath = relative(REPO_ROOT, file);
    const source = withoutComments(readFileSync(file, "utf-8"));
    const body = relPath === declaredIn ? source.replace(declaration, " ") : source;
    if (new RegExp(String.raw`\b${symbol}\b`).test(body)) found.push(relPath);
  }
  return found;
}

describe("SECURITY.md", () => {
  const text = read(SECURITY);

  it("names one disclosure channel, and the versions it will fix", () => {
    // This page used to have no channel to name and said so. Publishing turns
    // that into an obligation with two halves a reporter needs before they can
    // act: WHERE a report goes privately, and WHICH versions a fix would reach.
    // A page with the first and not the second sends a reporter to a form and
    // leaves them guessing whether their version is in scope.
    expect(text, "SECURITY.md names no advisory form").toContain(ADVISORY_URL);
    expect(text).toMatch(/private vulnerability reporting/i);
    expect(text, "SECURITY.md does not say a public issue is the wrong channel").toMatch(
      /[Dd]o not\s+open a public issue/,
    );
    expect(text).toMatch(/CVE/);

    // The supported-versions table was a tracked gap while nothing shipped. It
    // is a table now, so it is asserted as one rather than as an admission.
    expect(text, "SECURITY.md has no supported-versions section").toMatch(/## Supported versions/);
    expect(text, "SECURITY.md does not mark 1.x supported").toMatch(/\|\s*`1\.x`\s*\|\s*Yes/);
  });

  it("points every control at a file AND an enclosing symbol that exist", () => {
    // The addresses used to be `file:line`, which the page itself admitted drift
    // with the code — and by the time they had drifted, two rows were claiming
    // controls whose functions had no production caller at all. A `file::symbol`
    // address is checkable, and this is the check.
    const pointers = [...text.matchAll(/`([^`]+)`/g)]
      .map((match) => match[1] ?? "")
      .filter((span) => span.startsWith("src/"));

    expect(pointers.length).toBeGreaterThanOrEqual(10);
    // Line-number addresses are retired: they cannot be verified, so they are not
    // allowed back in.
    for (const pointer of pointers) {
      expect(pointer, `SECURITY.md cites ${pointer} by line number`).not.toMatch(/:\d+$/);
    }

    let symbolsChecked = 0;
    for (const pointer of new Set(pointers)) {
      const [file = "", symbol] = pointer.split("::");
      expect(existsSync(join(REPO_ROOT, file)), `SECURITY.md cites missing ${file}`).toBe(true);
      if (symbol === undefined) continue;
      symbolsChecked += 1;
      const source = read(file);
      // A declaration of that name, in that file — not a mention of it.
      const declared = new RegExp(
        `\\b(?:function|const|class|interface|type|enum)\\s+${symbol}\\b|\\b${symbol}\\s*[(:=]`,
      );
      expect(declared.test(source), `${file} declares no ${symbol}`).toBe(true);
    }
    expect(symbolsChecked, "SECURITY.md names no enclosing symbols").toBeGreaterThanOrEqual(10);
  });

  it("cites no control in the table that nothing under src/ reaches", () => {
    // The tool-allowlist row cited `checkToolAccess` and called the control
    // "enforced in-process and by the emitted guard", while that function has no
    // production caller at all — the generated guard script is the whole of it,
    // as `src/tools/allowlist.ts` says in its own header. Symbol EXISTENCE
    // passed the claim through, so the table's addresses are now held to the
    // call graph too: an address in this table names something the engine runs.
    const table = text.slice(
      text.indexOf("## What the engine defends today"),
      text.indexOf("## Network and data handling"),
    );
    const cited = [...table.matchAll(/`(src\/[^`]+::[A-Za-z_$][\w$]*)`/g)].map(
      (match) => match[1] ?? "",
    );
    expect(cited.length, "the control table cites no symbol at all").toBeGreaterThanOrEqual(10);

    for (const pointer of new Set(cited)) {
      const [file = "", symbol = ""] = pointer.split("::");
      expect(
        referencesTo(symbol, file),
        `SECURITY.md claims ${pointer} as an active control, but nothing under src/ ` +
          `references it. Cite what runs, and state the unwired half under ` +
          `"What it does not defend".`,
      ).not.toEqual([]);
    }
  });

  it("holds the in-process check's disclosure to the call graph, both ways", () => {
    // The counterpart of the table gate, and the mirror of the header assertion
    // in test/tools/allowlist.test.ts: while nothing calls the check, the page
    // may not claim in-process enforcement and must name the function below the
    // line; the moment something calls it, this fails until the page is rewritten.
    const wired = referencesTo("checkToolAccess", "src/tools/allowlist.ts");

    if (wired.length === 0) {
      expect(text, "SECURITY.md claims in-process enforcement nothing calls").not.toMatch(
        /[Ee]nforced in-process/,
      );
      expect(
        text.indexOf("checkToolAccess"),
        'checkToolAccess has no production caller and is not disclosed under "What it does not defend"',
      ).toBeGreaterThan(text.indexOf("## What it does not defend"));
    } else {
      expect(
        text,
        `checkToolAccess is referenced by ${wired.join(", ")} — SECURITY.md still calls it unwired.`,
      ).not.toMatch(/no production caller/);
    }
  });

  it("states the three install routes and that none of them fetches", () => {
    // The page said only bundled packs and local directories install, while the
    // default refusal coaches an operator toward the third route and --help
    // documents it. Understating the surface is the same defect as overstating
    // a control.
    expect(text).toMatch(/node_modules/);
    expect(text).toMatch(/local directory/i);
    expect(text).toMatch(/bundled first-party packs/i);
    expect(text).toMatch(/fetched over the network/i);
    // And the org-policy line no longer contradicts it eleven lines earlier.
    expect(text).toMatch(/org trust policy[\s\S]{0,80}narrows them/i);
  });

  it("names the client config files a pack hook actually lands in", () => {
    // The hook caveat pointed at `.stamity/generated/hooks/`, which is where the
    // ENGINE's own scripts land. A pack-supplied hook never lands there: it
    // becomes an entry in the client's own config.
    for (const path of [".claude/settings.json", ".cursor/hooks.json", ".codex/hooks.json"]) {
      expect(text, `SECURITY.md omits ${path}`).toContain(path);
    }
    expect(text).toContain(".stamity/generated/hooks/");
    expect(text).toMatch(/MCP server definition[\s\S]{0,20}likewise becomes a launcher/i);
  });

  it("ledgers the obligations it has not met instead of implying they are met", () => {
    // Two obligations were once accepted as risk in silence: no supported-
    // versions table existed anywhere, and the threat model was written as
    // "re-run a pass", which implies one exists to re-run. The first shipped at
    // 1.0.0 and is asserted as a table above; the rest are still ledgered, and
    // a page that quietly drops the ledger reads as one that met them.
    expect(text).toMatch(/standards mapping/i);
    expect(text).toMatch(/no threat-model document exists to re-run/i);
    expect(text).not.toMatch(/re-run a threat-model pass/i);
  });

  it("does not claim a control whose functions no production path calls", () => {
    // Both rows asserted an ACTIVE defense. `guardInput` and
    // `validateAgentOutput` have no caller outside their module and reject
    // nothing; `hashToolManifest` and `detectToolManifestDrift` likewise.
    for (const unwired of [
      "guardInput",
      "validateAgentOutput",
      "hashToolManifest",
      "detectToolManifestDrift",
    ]) {
      const index = text.indexOf(unwired);
      expect(index, `SECURITY.md never mentions ${unwired}`).toBeGreaterThan(0);
      expect(
        index,
        `${unwired} is claimed above "What it does not defend"`,
      ).toBeGreaterThan(text.indexOf("## What it does not defend"));
    }
    // The one live bound is stated as the live one.
    expect(text).toContain("MAX_USER_CONTENT_LENGTH");
    expect(text).toMatch(/250 000-character/);
  });

  it("covers the four surfaces the phase claims, and the limits", () => {
    expect(text).toMatch(/trust ladder/i);
    expect(text).toMatch(/deny-scan/i);
    expect(text).toMatch(/allowlist/i);
    expect(text).toMatch(/atomic rename/i);
    expect(text).toMatch(/does not defend/i);
  });
});

describe("CONTRIBUTING.md", () => {
  const text = read(CONTRIBUTING);

  it("states the public contribution posture, approval count included", () => {
    expect(text, "CONTRIBUTING does not say contributions are open").toMatch(
      /[Pp]ull requests are welcome/,
    );
    // The solo-maintainer reality, stated rather than dressed up: a contributor
    // who reads "0 required approvals" knows what merged their patch, and a
    // page that hid it would be describing a review that does not happen.
    expect(text, "CONTRIBUTING does not state the required-approval count").toMatch(
      /0 required approvals/,
    );
    expect(text, "CONTRIBUTING does not say CI gates the merge").toMatch(/CI/);
    // Dogfood-as-review: the setup this repo emits is the setup that reviews it. Held to
    // COMMAND_PREFIX rather than to PRODUCT — see that constant for why the two stopped agreeing.
    expect(text, "CONTRIBUTING names no review path for an external PR").toContain(
      `/${COMMAND_PREFIX}pr-resolve`,
    );
    expect(text, "CONTRIBUTING omits the DCO sign-off").toContain("git commit -s");
    expect(text).toMatch(/DCO/);
    expect(text).toMatch(/[Cc]onventional-commit/);
    // The closed posture is retired; it must not read as closed again.
    expect(text).not.toMatch(/external contributions are not accepted/i);
  });

  it("documents the dev loop and the three test lanes", () => {
    expect(text).toContain("npm run check");
    expect(text).toMatch(/virtual-filesystem unit tests/i);
    expect(text).toMatch(/golden files/i);
    expect(text).toMatch(/child-process end-to-end/i);
    expect(text).toMatch(/property tests/i);
  });

  it("lists a regeneration command for every generated artifact class", () => {
    for (const command of [
      "node scripts/generate-capability-matrix.mjs",
      "node scripts/generate-docs.mjs",
      "node scripts/generate-pack-manifests.mjs",
      "node dist/cli.js sync",
    ]) {
      expect(text, `CONTRIBUTING.md omits \`${command}\``).toContain(command);
    }
  });

  it("carries the leak-gate note, by name and by script path", () => {
    // The gate is a step a contributor will hit before any other, and the page
    // is where they find out what it is. Both halves are asserted: the row in
    // the gate table names the step, and the note names the script that runs.
    expect(text, "CONTRIBUTING has no `Leak gate` row").toMatch(/Leak gate/);
    expect(text).toContain("npm run gate");
    expect(text).toContain("scripts/leak-gate.mjs");
    expect(text, "CONTRIBUTING does not say what the gate refuses").toMatch(/reserved/i);
  });
});

/**
 * The guides, held to the claims each one exists to make.
 *
 * The block above proves a guide is datable, linkable and leak-free. It cannot
 * prove the page still SAYS the thing it was written to say, and four of these
 * seven make a claim about a mechanism that can move underneath it: the doctor's
 * probe set, the trust ladder's rungs, whether signature verification is armed,
 * and what the predecessor's own uninstall verb destroys. So each assertion
 * below reads the mechanism rather than a second copy of it, the way the README
 * corpus counts do.
 *
 * Three guides have no bespoke case here yet, for two different reasons. The
 * workflow guide narrates which touchpoint to open and what each writes, which
 * `AGENTS.md` owns rather than any symbol this file can read — a case pinning it
 * to the touchpoint index belongs with whichever change makes that index
 * readable. The customization and workspaces guides are the opposite shape: what
 * they claim IS readable — the override tree's four class paths, the strict/
 * advisory split and the per-class line thresholds from
 * `src/content/userContent.ts`; the workspace subcommand set, the status row
 * states and the three-field bridge from `src/cli/commands/workspace.ts` and
 * `src/workspace/` — so their gap is a case nobody has written, not a claim
 * nothing can reach. All three are held to the bucket-wide contract above and to
 * their own re-open triggers meanwhile.
 */
describe("the guides", () => {
  it("carves the predecessor's name out for exactly one page, coupled to the leak gate", () => {
    expect(RESERVED_TOKENS, "the carved-out token is not a reserved name at all").toContain(
      PREDECESSOR_TOKEN,
    );

    // Asserted live, not left standing. A carve-out for a page that stopped
    // using it is one nobody would notice going stale — and it would quietly
    // license the next page that wants the exemption.
    expect(
      read(PREDECESSOR_NAME_PAGE).toLowerCase().includes(PREDECESSOR_TOKEN),
      `${PREDECESSOR_NAME_PAGE} no longer names the predecessor — drop the carve-out`,
    ).toBe(true);

    // The other half of the coupling: the gate's allowlist is where the same
    // decision lives for the tree-wide scan, and exactly one PUBLISHED page is
    // on it. Everything else there is source or build output.
    const gate = read("scripts/leak-gate.mjs");
    const body = /const PREDECESSOR_ALLOWLIST = \[([^\]]*)\]/.exec(gate)?.[1];
    expect(body, "the leak gate has no PREDECESSOR_ALLOWLIST to read").not.toBeUndefined();
    const entries = [...(body ?? "").matchAll(/'([^']*)'/g)].map((match) => match[1] ?? "");
    expect(
      entries.filter((entry) => entry.startsWith("docs/")),
      "the leak gate's docs allowlist is not exactly the one guide this suite exempts",
    ).toEqual([PREDECESSOR_NAME_PAGE]);
  });

  it("is reachable: every guide is in the agent-native index, and every mapped one on the map", () => {
    const readme = read(README);
    const index = read("llms.txt");

    // The index carries the whole tree, unlisted pages included — that is what makes it the
    // agent-native map, and it is where the migration guide stays findable by a reader who
    // arrives without the predecessor's link in hand.
    for (const page of GUIDES) {
      expect(index, `llms.txt does not list ${page}`).toContain(`](${page})`);
    }

    for (const page of MAPPED_GUIDES) {
      expect(readme, `README does not link ${page}`).toContain(`](${page})`);
    }

    // The omission asserted from the other side, so re-adding the row fails here rather than
    // quietly undoing the decision MAPPED_GUIDES records.
    expect(
      readme,
      "README rowed the migration guide again — it is reached from the predecessor's own material",
    ).not.toContain(`](${MIGRATION})`);
  });

  it("getting started shows the install line and the whole command surface", () => {
    const text = read(GETTING_STARTED);
    expect(text, "the getting-started guide never shows the install command").toContain(
      INSTALL_COMMAND,
    );
    // Hand-maintained, in the order `src/cli.ts` advertises, and it is the DRIVER: a verb joins
    // the surface here first and the page is then obliged to name it, which is what made
    // `workspace` a required word on that page rather than an optional one. The plumbing verb is
    // deliberately absent — `learn` is not something a reader types.
    for (const command of [
      "init",
      "sync",
      "check",
      "validate",
      "add",
      "config",
      "workspace",
      "clean",
    ]) {
      expect(text, `the getting-started guide omits \`${command}\``).toContain(`\`${command}\``);
    }
    expect(text, "the getting-started guide does not say where state lives").toContain(".stamity/");
  });

  it("migration names both paths and cites the predecessor's own uninstall verb", () => {
    const text = read(MIGRATION);
    expect(text, "the migration guide does not show the guided path").toContain(INSTALL_COMMAND);
    expect(
      text,
      "the migration guide does not cite the predecessor's own clean command",
    ).toContain(`npx ${PREDECESSOR_TOKEN} clean`);
  });

  it("migration never puts the purge flag in a line a reader would copy", () => {
    const text = read(MIGRATION);

    // It must WARN about the flag: a migration guide that never mentions it
    // leaves the reader to meet it in the predecessor's own help, where nothing
    // says it destroys the two surfaces this migration reads.
    expect(text, "the migration guide does not warn about the purge flag").toMatch(/--purge/);

    // And it must never appear in a runnable block. That flag deletes the state
    // directory the carry reads and the credentials it keeps, irreversibly and
    // with the pre-clean snapshots going too — so a copy-pasteable line
    // carrying it is the one defect this page cannot ship.
    for (const block of fencedBlocks(text)) {
      expect(block, "a runnable block in the migration guide carries --purge").not.toContain(
        "--purge",
      );
    }
  });

  /**
   * The two claims on the migration guide that no other gate can reach, pinned
   * because each was written wrong twice before this page shipped.
   *
   * Path B once read "costs you nothing", while the uninstall it recommends
   * deletes `hatch.json` — the one file the offered config defaults are read
   * out of. And the closing step named an uninstall without naming either the
   * flag it must not carry or the credential file that has to leave the tree
   * ahead of it. Both are statements about the PREDECESSOR's behaviour, so
   * nothing in this tree can derive them: a reader running the page is the only
   * one who finds out, and by then the files are gone.
   *
   * Sectioned rather than page-wide, and ORDERED rather than merely present.
   * A back-up named after the uninstall it protects is a back-up nobody takes
   * in time, so "names both" is not the property being asserted — "names the
   * back-up first" is.
   */
  it("migration pins the manifest loss to Path B and the ordered uninstall to the last step", () => {
    const text = read(MIGRATION);
    const section = (heading: string): string => {
      const start = text.indexOf(heading);
      expect(start, `the migration guide has no ${heading} section`).toBeGreaterThanOrEqual(0);
      const next = text.indexOf("\n## ", start + heading.length);
      return text.slice(start, next === -1 ? undefined : next);
    };

    // Path B has to name the FILE. "It costs you the config defaults" was true
    // and unactionable: it never said what deletes them, so nobody read the
    // manifest out before running the clean.
    expect(
      section("## Path B"),
      "the Path B section never names the manifest a plain clean deletes",
    ).toContain("hatch.json");

    const lastStep = section("## Your last step");
    const clean = `npx ${PREDECESSOR_TOKEN} clean`;

    expect(lastStep, "the last step never names the predecessor's own uninstall").toContain(clean);
    expect(
      lastStep,
      "the last step names the uninstall without excluding the flag that destroys the carry",
    ).toContain("without `--purge`");

    // And no occurrence of it in this section carries that flag — the prose
    // above is worth nothing if a line below it shows the destructive form.
    for (let at = lastStep.indexOf(clean); at !== -1; at = lastStep.indexOf(clean, at + 1)) {
      expect(
        lastStep.slice(at, at + clean.length + 40),
        "the last step shows the uninstall carrying the flag that deletes the credentials",
      ).not.toContain("--purge");
    }

    const backup = lastStep.indexOf(".env.mcp");
    expect(backup, "the last step never names the credential file").toBeGreaterThanOrEqual(0);
    expect(
      backup,
      "the last step orders the credential back-up after the uninstall that can take it",
    ).toBeLessThan(lastStep.indexOf(clean));
  });

  it("packs names every rung the ladder actually ships", () => {
    const text = read(PACKS_AND_TRUST);
    for (const tier of TRUST_TIERS) {
      expect(text, `the packs guide omits the \`${tier}\` tier`).toContain(tier);
    }
  });

  it("packs calls verification unarmed for exactly as long as it is", () => {
    // The mirror of the SECURITY.md call-graph gate, on the page a pack author
    // reads first. While the unarmed stand-in is the ONLY verifier the module
    // declares, the guide must say verification is not armed; the day a real
    // one is declared beside it, this fails until the page is rewritten. A page
    // that overstates a defence is the defect; one that understates a shipped
    // one is the same defect facing the other way.
    const trust = read("src/pack/trust.ts");
    const declared = [...trust.matchAll(/export const (\w+): SigstoreVerifier\b/g)].map(
      (match) => match[1] ?? "",
    );
    expect(declared, "no SigstoreVerifier is declared at all — this gate reads nothing").not.toEqual(
      [],
    );

    const armed = declared.filter((name) => name !== "notYetArmedSigstoreVerifier");
    const text = read(PACKS_AND_TRUST);
    if (armed.length === 0) {
      expect(text, "the packs guide does not disclose that verification is unarmed").toMatch(
        /not armed/i,
      );
    } else {
      expect(
        text,
        `${armed.join(", ")} is declared — the packs guide still calls verification unarmed`,
      ).not.toMatch(/not armed/i);
    }
  });

  it("troubleshooting documents the doctor rows check prints, and only those", () => {
    // Read out of the command rather than listed here: the probes are local
    // constants, so a new one lands with no export to notice and the page would
    // have gone on describing eight of nine.
    const source = read("src/cli/commands/check.ts");
    const probes = new Set(
      [...source.matchAll(/const id = "([a-z-]+)"/g)].map((match) => match[1] ?? ""),
    );
    expect(probes.size, "no doctor probe ids could be read out of check.ts").toBeGreaterThanOrEqual(
      9,
    );

    // Read out of the doctor SECTION rather than the whole page: the exit-model
    // table above it has a backticked first column too, and matching page-wide
    // pulled its header cell in as a tenth probe.
    const page = read(TROUBLESHOOTING);
    const start = page.indexOf("## What `check` prints");
    const end = page.indexOf("## Common failures");
    expect(start, "the troubleshooting guide has no doctor section").toBeGreaterThanOrEqual(0);
    expect(end, "the troubleshooting guide has no section after the doctor one").toBeGreaterThan(
      start,
    );

    // Set equality both ways. A probe added and not documented fails, and so
    // does a row for a probe that was removed — a remedy for a check that no
    // longer runs is worse than no row, because a reader acts on it.
    const documented = [...page.slice(start, end).matchAll(/^\| `([a-z-]+)` \|/gm)].map(
      (match) => match[1] ?? "",
    );
    expect(documented.toSorted()).toEqual([...probes].toSorted());
  });

  it("troubleshooting sends a reporter to the two channels, and no third one", () => {
    const text = read(TROUBLESHOOTING);
    expect(text, "the troubleshooting guide names no issue tracker").toContain(
      "https://github.com/zomarit/stamity/issues",
    );
    expect(text, "the troubleshooting guide names no private advisory form").toContain(
      ADVISORY_URL,
    );
    expect(text, "the troubleshooting guide does not route security away from public issues").toMatch(
      /do not open a public issue/i,
    );
  });
});
