import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  RUN_OF_RECORD_CARRIED_TO,
  RUN_OF_RECORD_PATH,
  RUN_OF_RECORD_RELEASE,
  carriedToRelease,
} from "../src/cli/docs/measurements.ts";
import { COMMAND_ID_PREFIX } from "../src/content/catalog.ts";
import {
  CLASS_LAYOUT,
  LEAN_LINE_THRESHOLDS,
  SKILL_FILE,
} from "../src/content/userContent.ts";
import { TRUST_TIERS } from "../src/pack/trust.ts";
import { CONTENT_CLASSES } from "../src/types/content.ts";
import { CORPUS_ROOT, loadCorpusIndex } from "./corpus/harness.ts";
// @ts-expect-error — the distribution modules ship as plain .mjs with no type declarations:
// they run under bare Node in a release job, with no TypeScript nearby.
import { buildCatalogIdentity } from "../scripts/plugins/catalogs.mjs";
// @ts-expect-error — see above.
import { resolveDistributionIdentity } from "../scripts/distribution-identity.mjs";
// @ts-expect-error — see above.
import { renderClaudeManagedSettings } from "../scripts/plugins/managed-settings.mjs";

/**
 * The gate on the fourteen hand-written pages: three at the root, eleven guides
 * under `docs/`.
 *
 * The rest of `docs/` is generated and drift-tested against its renderer; these
 * thirteen are typed by a human, so the only guard is this file.
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
 * Two properties are asserted on all thirteen pages because the hand bucket is
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
// the array below is GUIDES' own reading order, so the customization guide sits first here and
// SIXTH there, and the workspaces guide last here and SEVENTH there.
//
// Three corrections this comment has already needed, kept as the warning they are. The ordinals
// are indices into a literal array, so inserting one entry moves every entry after it —
// DOCTRINE at position 3 moved these two once, and PLUGINS at position 3 has moved them again.
// And the array is NOT the sidebar's sequence, which this comment used to claim: the sidebar
// follows it except for MIGRATION, which is FIFTH here and deliberately unlisted there
// (`website/sidebars.ts`; MAPPED_GUIDES below carries the same decision for the README map).
const CUSTOMIZATION = "docs/customization.md";
const DOCTRINE = "docs/doctrine.md";
const ENTERPRISE_FORKS = "docs/enterprise-forks.md";
const GETTING_STARTED = "docs/getting-started.md";
const MIGRATION = "docs/migration.md";
const PACKS_AND_TRUST = "docs/packs-and-trust.md";
const PLUGINS = "docs/plugins.md";
const SECURITY_MAPPING = "docs/security-mapping.md";
const TROUBLESHOOTING = "docs/troubleshooting.md";
const WORKING_WITH_STAMITY = "docs/working-with-stamity.md";
const WORKSPACES = "docs/workspaces.md";

/**
 * The eleven hand-written guides under `docs/`.
 *
 * Everything else in that directory is rendered from code and carries a
 * "GENERATED FILE, rewrite it with X" header; these eleven are the only pages
 * there a human types, which is exactly the line the hand bucket is drawn on.
 *
 * `docs/specs/` is outside the bucket and outside the site: five engineering
 * design documents, excluded from the build by `website/docusaurus.config.ts`
 * and from the roster by `test/ci/docsRoster.test.ts`. They are not published
 * pages, so the published-page contract does not apply to them.
 */
const GUIDES: readonly string[] = [
  GETTING_STARTED,
  WORKING_WITH_STAMITY,
  // Third, beside the two pages a first-time reader takes first: the plugin route is an
  // alternative to `init`, not a topic a reader reaches for after the setup already works.
  PLUGINS,
  DOCTRINE,
  MIGRATION,
  CUSTOMIZATION,
  WORKSPACES,
  ENTERPRISE_FORKS,
  PACKS_AND_TRUST,
  TROUBLESHOOTING,
  // Appended rather than filed beside the security-adjacent guides on purpose: the ordinals in
  // the comment above index into this literal, so an insertion in the middle moves every entry
  // after it and the note goes stale the same day.
  SECURITY_MAPPING,
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

/**
 * The count words the pages spell out, indexed by the number they name.
 *
 * A page states its bucket in prose ("the eleven guides", "all fourteen"), and
 * the prose is a literal that drifts when a guide lands — the doctrine page
 * said "ten" and "thirteen" for a whole package after the plugins guide made
 * them eleven and fourteen. Reading the word off the array length is what
 * moves the pin with the surface instead of after it.
 */
const COUNT_WORDS: readonly string[] = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen",
  "nineteen", "twenty",
];
const countWord = (count: number): string => {
  const word = COUNT_WORDS[count];
  if (word === undefined) throw new Error(`no count word for ${count}: extend COUNT_WORDS`);
  return word;
};

/**
 * The client-contract evidence page: a hand-written record, and NOT a published page.
 *
 * It joins a bucket of its own rather than `HAND_PAGES`, and the reason is one rule it cannot
 * satisfy by design. `ALLOWED_URL` above is an allowlist of this repository's own GitHub home,
 * written for pages whose readers are users; this page's entire job is to cite the four
 * vendors' official documentation, so every claim on it hangs off an outside URL. Putting it
 * in `HAND_PAGES` would mean weakening that allowlist for the three published pages it was
 * written for. What it DOES inherit is everything the bucket is defined by — a currency header
 * with a date, a falsifiable re-open trigger, and no reserved name — plus the Codex
 * hook-loading facts below, which are the claims the page was re-attested for.
 */
const CLIENT_CONTRACTS = ".github/client-contracts.md";

/** Every dated evidence record. One today; the list is what makes adding a second cheap. */
const EVIDENCE_PAGES: readonly string[] = [CLIENT_CONTRACTS];

/**
 * The date the evidence bucket was last re-read against its cited sources.
 *
 * Held to its own constant rather than to `REATTESTATION_DATE`, because the two passes are
 * different work: the hand bucket is re-read against THIS TREE, and an evidence page is re-read
 * against the VENDOR PAGES it cites, which move on the vendors' schedule. The pin is the same
 * shape as the hand bucket's — the newest date in the bucket is this constant, so it has to
 * move on the next pass, and no page may claim a date later than it.
 *
 * MOVED 2026-09-17: introduced with the bucket. The 2026-09-17 audit re-read every vendor page
 * this record cites and the Codex paragraph was rewritten against the 2026-09-15 measurement.
 *
 * MOVED 2026-09-22, by the pass that measured four Copilot CLI facts against the 1.0.87 binary the
 * candidate's own harness turned up: what `COPILOT_ALLOW_ALL` set to exactly `true` trusts and what
 * `--allow-all-tools` does not, which hooks load regardless of folder trust, that no plugin-root
 * variable reaches a command's shell while the CLI's changelog states that a plugin's HOOKS get
 * three, and the two listings that report a root. The page's Copilot bullet and container section
 * carry them, so its header moves with them.
 *
 * MOVED 2026-09-21, by the 1.9.0 release cut's evidence pass. Every cited page answered this host
 * that day — including cursor.com, which had refused every connection from it on 2026-09-20 — so
 * the pass re-read all of them and the page's claims moved with what they now say: the Copilot
 * reference documents the live load of a local directory-source marketplace, the Cursor hooks page
 * states the per-source hook working directory this repository had only measured, the Codex hooks
 * page asks a repo-local hook to resolve from the git root, and the published Agent Plugins schema
 * still agrees field for field with the vendored copy. The page also lost the second, stale
 * currency claim it carried under this header.
 */
const EVIDENCE_REATTESTATION_DATE = "2026-09-22";

/**
 * The Codex hook-loading facts the contract page must carry, each a literal a reader can check
 * against the cited page or the recorded measurement.
 *
 * All three loading steps, because a reply that names only the feature flag is the half-answer
 * that left every emitted hook inert through the whole 1.7.0 window: the flag, the project
 * trust level, and per-hook trust. Then the headless result, which is the other half — the
 * emitted file being correct and the client running it are two claims, and this page is where
 * they are kept apart.
 */
const CODEX_HOOK_FACTS: readonly string[] = [
  "features.hooks",
  "[features] hooks = true",
  'projects.<path>.trust_level = "trusted"',
  "--dangerously-bypass-hook-trust",
  "codex exec",
  "0.154.0",
];

/**
 * The line budget of the workflow guide, declared by
 * `docs/plans/001-package-8-operator-experience.md` — ":24 written to ≤150 physical lines", and
 * a `wc -l` acceptance criterion at :335 — and that page sits at exactly 150, so it has zero
 * headroom and one added line is the drift this catches.
 *
 * Asserted on exactly this page and README below: the other six guides were never written to a
 * line budget, and asserting one on them would invent a rule rather than hold a declared one.
 */
const MAX_LINES = 150;

/**
 * README's own budget.
 *
 * TEST CHANGE, justified: this was the same 150 as the guide's, on one shared constant. The
 * two figures have different provenance — the guide's is DECLARED by the plan above, README's
 * is the hand-page posture's own — and holding them on one constant meant a correction to
 * README could only be paid for out of a budget the guide declares. Correcting "Install and
 * first run" needed four lines: the manifest sentence now names which verbs read the manifest
 * and which do not (`validate` runs with or without one, `learn` and `handoff` want only
 * `.stamity/`), and the prerequisite sentence now carries `worktree`'s `git`-on-PATH
 * requirement. The guide's 150 is untouched; README's figure moved with the sentences.
 *
 * TEST CHANGE, justified: 155 to 156, the cost of ONE map row. `docs/measurements.md` is a new
 * generated page, and the map is what makes a page reachable from README — a row is not optional
 * polish, it is the thing `README_LINK_TARGETS` below pins. The paragraph under the table was
 * rewrapped in the same change (it had to move anyway: it counts the generated rows and names
 * every page the docs script writes), which pays for nothing — that paragraph wraps to the same
 * nine lines with the new path in it. So the budget moves by exactly the row, and by nothing
 * else: the page gained no prose it did not need.
 *
 * TEST CHANGE, justified: 156 to 157, the cost of ONE more map row, on the same reasoning.
 * `docs/security-mapping.md` is a new hand page, and a guide the map does not name is one only
 * the index knows about — which is precisely what `MAPPED_GUIDES` above refuses to allow. The
 * `llms.txt` row's guide count moved from nine to ten in the same change, in place, and paid
 * for nothing. So again the budget moves by exactly the row.
 *
 * TEST CHANGE, justified: 157 to 158, the cost of ONE more map row, on the same reasoning a
 * third time. `docs/plugins.md` is a new hand page, so the map owes it a row. Everything else
 * the plugin route cost README moved IN PLACE and paid for nothing: the `## Commands` run
 * gained `plugin` and re-wrapped inside its own five lines, the count word moved from nine to
 * ten, and the `llms.txt` row's guide count from ten to eleven. So the budget moves by exactly
 * the row, and by nothing else.
 */
const README_MAX_LINES = 158;

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
 *
 * TEST CHANGE, justified: the commit form carried no date the suite could read, so the
 * re-attestation clause the Package 14 rewrite stamped onto thirteen pages was decorative — the
 * date assertion below saw only the one page still on the cut form, and a fourteenth page left
 * undated would have failed nothing. The clause is optional in the pattern because a page nobody
 * re-read between cuts keeps its commit citation alone; it is NOT optional in the assertion, which
 * requires every hand page to carry one of the two dates.
 *
 * Capture 1 is the commit form's re-attestation date, capture 2 the cut form's date. Two groups
 * rather than one, because the two dates are held to different constants.
 */
const CURRENCY_HEADER =
  /<!--\s*HAND-WRITTEN PAGE — verified against the tree at (?:commit [0-9a-f]{7,40}\.(?: Re-attested (\d{4}-\d{2}-\d{2})[^.]*\.)?|the \d+\.\d+\.\d+ release cut \((\d{4}-\d{2}-\d{2})\)\.)/;

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
// MOVED 2026-09-23, from "2026-09-21" (the 1.9.0 cut) to the 1.9.1 cut. Four read-only attestors
// at the stronger class re-read every claim of the bucket against the 1.9.1 candidate, and the
// whole bucket was restamped onto the cut form; the claims that moved with it: the frozen
// merge-ready snapshot README links (2026-09-23, still 6 of 8), the run of record's carried-to
// release and candidate on README, in the doctrine and on the measurements page, the DCO walk in
// GOVERNANCE and CONTRIBUTING (the base-to-head comparison, not the commit list), the e2e lane's
// six files and the authoring suite among the harness-driven five in CONTRIBUTING, the dogfood
// provenance line and the learnings count in troubleshooting, the regeneration-list sentence and
// the recommended `generatedPaths` (now naming `docs/measurements.md`) in the enterprise guide,
// and on the plugins page the three remote-source provenance notes, the migration-engine version
// and the Renovate preset's scope.
//
// MOVED 2026-09-21, from "2026-09-15" (the 1.8.0 cut) to the 1.9.0 cut. The whole hand bucket
// was re-read claim by claim against the candidate tree and restamped onto the cut form, which is
// what the release controls checklist's fourth line asks for; nine claims moved with it (the
// merge-ready figure and the eval run of record on README, the run of record in the doctrine, the
// probe count and the proved install routes in getting started, the smoke count in CONTRIBUTING,
// the publish job's action count and two new controls in SECURITY.md, the dogfood provenance
// sample in troubleshooting, the contracts page's revalidation date in customization, and the
// Claude, Copilot and Codex lifecycle routes on the plugins page).
//
// MOVED 2026-09-15, from "2026-09-10" (the 1.5.0 cut) to the 1.8.0 cut. Four read-only
// attestors re-read every claim on the hand bucket against this tree at this cut and four
// claims moved with it.
//
// TEST CHANGE, justified: the paragraph that stood here said every page in the bucket carries the
// new date. That stopped being true when the Package 14 rewrite moved thirteen pages onto the
// commit form, which cites a sha and re-attests with its own date. The two forms are now described
// as they are: a cut-form page is dated by RELEASE_CUT_DATE, a commit-form page by the
// REATTESTATION_DATE below, and each form's newest date is pinned to its own constant. The
// direction the pin is written for is unchanged — it fails a re-cut that restamps nothing, never
// one that restamps honestly.
const RELEASE_CUT_DATE = "2026-09-23";

/**
 * The date the current re-verification pass re-read the hand bucket on.
 *
 * A page re-verified BETWEEN release cuts carries the commit form of the header plus a
 * `Re-attested <date>` clause naming that pass. The pair this constant holds mirrors
 * RELEASE_CUT_DATE's: the newest re-attestation on the bucket must equal this constant, so it has
 * to move on the next pass or the assertion fails, and no page may claim a re-attestation later
 * than it. It must also be at or after RELEASE_CUT_DATE — a re-verification that predates the cut
 * the page ships in is not a re-verification of this tree.
 *
 * MOVED 2026-09-16: introduced by the Package 14 rewrite, which re-attested thirteen of the
 * fourteen hand pages against commit e79dcf0 on that date. `docs/migration.md` was not rewritten
 * and still carries the 1.8.0 cut form, which is why both constants are live.
 *
 * TEST CHANGE, justified: MOVED 2026-09-20, from 2026-09-16, by the pass that added the plugin
 * guide. The constant is NOT decoration here — a new hand page has to carry a date, and the only
 * honest date a page written today can carry is today's, which the 2026-09-16 pin would have
 * refused as "later than the pass it ships in". Three pages carry the new date because three
 * pages were re-read against this tree in that pass: `docs/plugins.md` (written), `README.md`
 * (its command surface and its map) and `docs/getting-started.md` (its verb list and its
 * glossary). Every other page keeps the date it was actually verified on, which is the property
 * the pair of assertions below exists to protect.
 *
 * MOVED 2026-09-22, and the commit form is back in the bucket with exactly one member. The Copilot
 * measurements of that date landed on `docs/plugins.md` AFTER the 2026-09-21 cut, so that page can
 * no longer say its claims were verified at the cut and nothing later: it carries the commit form
 * naming the cut's own re-attestation commit plus `Re-attested 2026-09-22`, and this constant names
 * that pass. The other thirteen keep the cut form and the cut's date, which is what the pin above
 * still reads.
 *
 * MOVED 2026-09-21, to the 1.9.0 cut date, and with it the commit form left the bucket: a release
 * cut re-attests every hand page against the candidate tree and stamps the cut form on all
 * fourteen, so there is no between-cuts pass left to date. The pin below covers that state rather
 * than skipping it — see the assertion's own note.
 *
 * MOVED 2026-09-23, to the 1.9.1 cut date. The 1.9.1 cut restamped all fourteen pages, the
 * plugins page included, onto the cut form — its 2026-09-22 Copilot measurements were re-read
 * against the candidate with everything else — so the commit form again has no members and the
 * constant equals the cut, as the assertion's else branch requires.
 *
 * NOT MOVED, 2026-09-23, after the 1.9.1 cut: the commit form has one member again. Retiring one
 * learning moved the learnings count in `docs/troubleshooting.md`'s sample `check` transcript, so
 * that page carries the commit form naming the cut's re-attestation commit plus `Re-attested
 * 2026-09-23` — the same day as the cut, so this constant already names the pass and the
 * assertion's first branch now reads it.
 *
 * NOT MOVED, 2026-09-23 (UTC), a second time: the ledger pass re-read `README.md` (its plumbing
 * verbs, now three with `ledger`) and `docs/getting-started.md` (the hidden verbs, the `.stamity/`
 * table's runs row with its uncommitted `reports/` folder, and what to commit), and moved both onto
 * the commit form naming that pass's base commit plus `Re-attested 2026-09-23`. The pass ran on
 * the constant's own date, so the constant already names it.
 *
 * TEST CHANGE, justified: MOVED 2026-09-26, from 2026-09-23, by plan 010's docs-guides pass. That
 * pass re-read `docs/enterprise-forks.md` (the identity script, the fork release workflow and the
 * managed-settings template) and `docs/plugins.md` (the Codex remote walk of 2026-09-24 and the
 * Cursor and Codex organization routes) against the package head fcc4f59e, and moved both onto the
 * commit form with `Re-attested 2026-09-26`. A page re-read today can honestly carry only today's
 * date, which the 2026-09-23 pin refused as later than the pass it ships in. Every other page
 * keeps the date it was actually verified on.
 */
const REATTESTATION_DATE = "2026-09-26";

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
  // The measurements page joined the map when it shipped. Pinned here for the reason every other
  // generated page is: the row is what a reader navigates by, and a page the README does not name
  // is one only the index knows about.
  "docs/measurements.md",
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
 * Runs of whitespace collapsed to one space, applied to both sides of a containment pin.
 * A pinned sentence that a reflow re-wraps is the same sentence, and the pin should hold.
 */
const flowed = (text: string): string => text.replace(/\s+/g, " ");

/** The latest of a set of dates. ISO-8601 sorts lexicographically, which is why the header has it. */
const newest = (dates: readonly string[]): string | undefined => dates.toSorted().at(-1);

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

/**
 * One heading's section of a page: from the heading line to the next heading of the same or a
 * higher level, or the page's end. Lines inside a fenced block are never read as headings, so a
 * shell comment in a command block cannot end a section early. Empty when the heading is absent,
 * so a pin reading it fails on its own non-empty assertion rather than on a thrown index.
 */
function sectionOf(text: string, heading: string): string {
  const all = lines(text);
  const start = all.indexOf(heading);
  if (start === -1) return "";
  const level = (/^#+/.exec(heading)?.[0] ?? "").length;
  let fenced = false;
  for (let at = start + 1; at < all.length; at += 1) {
    const line = all[at] ?? "";
    if (line.startsWith("```")) fenced = !fenced;
    const depth = fenced ? 0 : (/^(#+) /.exec(line)?.[1] ?? "").length;
    if (depth > 0 && depth <= level) return all.slice(start, at).join("\n");
  }
  return all.slice(start).join("\n");
}

/** The bodies of a text's fenced blocks carrying one info string, in page order. */
const fencedBlocksOf = (text: string, info: string): string[] =>
  [...text.matchAll(new RegExp(`^\`\`\`${info}\\n([\\s\\S]*?)^\`\`\`$`, "gm"))].map((match) => match[1] ?? "");

/** A relative target resolved from the linking page's own directory. */
const resolveTarget = (page: string, target: string): string =>
  join(REPO_ROOT, dirname(page), target);

/**
 * The charter template — the one home for a touchpoint's one-line job.
 *
 * The corpus source, not the emitted `AGENTS.md`: the emission is a dogfood copy that a
 * skipped `sync` can leave stale, and reading it would make a stale emission look like a
 * wrong guide. The emitted copy stays covered by the cross-client emission goldens.
 */
const CHARTER_TEMPLATE = join(CORPUS_ROOT, "charter", "stamity-charter.md");

/** `- `/st-x` — one-liner`, and the two-space continuation the charter's own wrap produces. */
const TOUCHPOINT_BULLET = /^- `(\/st-[a-z-]+)` — (.*)$/;
const BULLET_CONTINUATION = /^ {2}(\S.*)$/;

/** `| `/st-x` | its job | reach for it when |` — 1 is the id, 2 is the job cell. */
const TOUCHPOINT_ROW = /^\|\s*`(\/st-[a-z-]+)`\s*\|([^|]*)\|/gm;

/** One-line prose compared without its wrap or its terminal period. */
const oneLine = (text: string): string => text.trim().replace(/\s+/g, " ").replace(/\.$/, "");

/** `id → one-liner` off the charter's `## Touchpoints` section, continuations joined. */
function charterTouchpoints(): Map<string, string> {
  const body = readFileSync(CHARTER_TEMPLATE, "utf-8");
  const section = body.split(/^(?=## )/m).find((part) => part.startsWith("## Touchpoints")) ?? "";
  const index = new Map<string, string>();
  let current = "";
  for (const line of lines(section)) {
    const bullet = TOUCHPOINT_BULLET.exec(line);
    if (bullet) {
      current = bullet[1] ?? "";
      index.set(current, bullet[2] ?? "");
      continue;
    }
    const more = BULLET_CONTINUATION.exec(line);
    if (more && current !== "") {
      index.set(current, `${index.get(current) ?? ""} ${more[1] ?? ""}`);
      continue;
    }
    current = "";
  }
  return index;
}

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
  // eight" when the customization guide did, "all nine" when the workspaces guide did, "all
  // twelve" when the enterprise-forks guide did: the name states the membership count, and the
  // loop below is unchanged through all of them and still runs over every member.
  it("all fourteen exist and carry real content", () => {
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
    // each pin is "the newest date is this one" rather than "every page carries this one".
    //
    // TEST CHANGE, justified: this read only capture 1 — the cut form's date — so the thirteen
    // pages the Package 14 rewrite moved onto the commit form dropped out of the check entirely,
    // leaving the whole pin resting on `docs/migration.md`. Both forms are read now, each held to
    // its own constant, and a page carrying NEITHER date fails rather than being skipped.
    const stamped = HAND_PAGES.map((page) => {
      const head = lines(afterFrontmatter(read(page))).slice(0, 6).join("\n");
      const match = CURRENCY_HEADER.exec(head);
      return { page, reattested: match?.[1], cut: match?.[2] };
    });

    for (const { page, reattested, cut } of stamped) {
      expect(
        reattested ?? cut,
        `${page} carries a currency header with no date — stamp it with a "Re-attested <date>" ` +
          `clause naming the pass that re-read it, or with the release cut it was verified at`,
      ).toBeDefined();
    }

    const reattestations = stamped
      .map(({ page, reattested }) => [page, reattested] as const)
      .filter((entry): entry is readonly [string, string] => entry[1] !== undefined);
    const cuts = stamped
      .map(({ page, cut }) => [page, cut] as const)
      .filter((entry): entry is readonly [string, string] => entry[1] !== undefined);

    expect(
      REATTESTATION_DATE >= RELEASE_CUT_DATE,
      `REATTESTATION_DATE ${REATTESTATION_DATE} precedes the ${RELEASE_CUT_DATE} cut it re-verifies`,
    ).toBe(true);

    for (const [page, date] of cuts) {
      expect(
        date <= RELEASE_CUT_DATE,
        `${page} attests to ${date}, later than the ${RELEASE_CUT_DATE} cut it ships in`,
      ).toBe(true);
    }
    expect(cuts.length, "no hand page states a release-cut date to check").toBeGreaterThan(0);
    expect(
      newest(cuts.map(([, date]) => date)),
      `no hand page was verified at the ${RELEASE_CUT_DATE} cut — move the banner date on the ` +
        `pages this cut rewrote, or move RELEASE_CUT_DATE to the cut that actually happened`,
    ).toBe(RELEASE_CUT_DATE);

    for (const [page, date] of reattestations) {
      expect(
        date <= REATTESTATION_DATE,
        `${page} re-attests to ${date}, later than the ${REATTESTATION_DATE} pass it ships in`,
      ).toBe(true);
    }
    // TEST CHANGE, justified: this required at least one page on the COMMIT form, which is true
    // only between cuts. A release cut re-attests the whole bucket against the candidate tree and
    // stamps the cut form on every page (the release controls checklist's fourth line), so at a cut
    // the commit form legitimately has no members and the old pin failed the honest state rather
    // than a dishonest one. The property is kept in both directions instead of dropped: with
    // commit-form pages present the newest of them must still equal REATTESTATION_DATE, and with
    // none present the constant must equal the cut it ships in. So the constant still has to move
    // at every cut and at every between-cuts pass, which is the direction it was written for, and
    // a bucket restamped onto the cut form cannot leave a stale re-attestation date behind it.
    if (reattestations.length > 0) {
      expect(
        newest(reattestations.map(([, date]) => date)),
        `no hand page was re-attested at ${REATTESTATION_DATE} — stamp the pages this pass ` +
          `re-read, or move REATTESTATION_DATE to the pass that actually happened`,
      ).toBe(REATTESTATION_DATE);
    } else {
      expect(
        REATTESTATION_DATE,
        `every hand page carries the ${RELEASE_CUT_DATE} cut form, so REATTESTATION_DATE names a ` +
          `pass with no pages left to date — move it to the cut, or restamp the page this pass ` +
          `actually re-read between cuts`,
      ).toBe(RELEASE_CUT_DATE);
    }
  });

  it("every sidebar-listed hand page declares its H1 as its title", () => {
    // Docusaurus reads the `title:` frontmatter key for the sidebar label AND the document
    // title; a page whose H1 and frontmatter title drift apart shows one heading in the sidebar
    // and a different one on the page. `migration.md` is excluded on purpose — it is off the
    // sidebar (see MAPPED_GUIDES), so there is no sidebar label to hold to its H1; the title it
    // declares beside its `slug:` is pinned by `test/ci/docsSite.test.ts` instead.
    let checked = 0;
    for (const page of MAPPED_GUIDES) {
      const text = read(page);

      // The block first, the key inside it — not one regex spelling both. A
      // title-only block is what these seven carry today, and the old pattern
      // required exactly that: the day one of them gains a `sidebar_position`
      // or a `description`, the page would report "carries no title
      // frontmatter" while carrying one. Same shape `test/ci/docsSite.test.ts`
      // reads the migration guide's `slug:` through.
      const block = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(text)?.[1];
      expect(block, `${page} carries no frontmatter block for the sidebar`).toBeDefined();
      const title = /^title: (.+)$/m.exec(block ?? "")?.[1];
      expect(title, `${page} carries no title frontmatter for the sidebar`).toBeDefined();

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

    // And "sidebar-listed" is read off the sidebar rather than assumed. MAPPED_GUIDES is
    // derived from the README-map decision (GUIDES minus MIGRATION); the sidebar is a separate
    // file with its own `present([...])` lists, and the two agree today by convention alone. A
    // guide dropped from the navigation would leave this test asserting a frontmatter title for
    // the sidebar of a page the sidebar does not carry.
    const sidebarCode = read("website/sidebars.ts");
    const listed = [...sidebarCode.matchAll(/'([a-z0-9/-]+)'/g)].map((match) => match[1]);
    for (const page of MAPPED_GUIDES) {
      const slug = page.replace(/^docs\//, "").replace(/\.md$/, "");
      expect(listed, `${page} is not listed in website/sidebars.ts`).toContain(slug);
    }
    expect(listed, "the migration guide is listed in the sidebar again").not.toContain(
      MIGRATION.replace(/^docs\//, "").replace(/\.md$/, ""),
    );
  });

  it(
    "passes the leak gate",
    () => {
      const gate = join(REPO_ROOT, "scripts/leak-gate.mjs");
      const result = spawnSync(process.execPath, [gate], {
        cwd: REPO_ROOT,
        encoding: "utf-8",
      });
      const detail =
        result.status === 0 ? "" : `exit ${String(result.status)}\n${result.stdout}${result.stderr}`;
      expect(detail).toBe("");
    },
    // This case is bounded by the whole-repository gate run it spawns, not by the suite-wide
    // 20s default in `vitest.config.ts` — which is sized for a CLI spawn, and which turned the
    // gate's growth into a CI timeout that named no cost. Derived, so it can be re-derived:
    // 16s local (`time node scripts/leak-gate.mjs`, three runs, 15.81-16.13s over 5,561 files)
    // x 2 for a runner class about half this machine's speed x 4 for margin on a shared runner
    // with a cold file cache ≈ 128s, rounded up to 180s. The tree grew because every run export
    // publishes each attempt's output under `evals/runs/<run>/calls/` and the gate reads all of
    // them; nothing is excluded from it. Kept in step with `GATE_RUN_TIMEOUT_MS` in
    // `test/ci/leakGate.test.ts`, which spawns the same gate.
    180_000,
  );
});

describe("evidence pages", () => {
  it("exist and carry real content", () => {
    for (const page of EVIDENCE_PAGES) {
      expect(existsSync(join(REPO_ROOT, page)), `${page} is missing`).toBe(true);
      expect(read(page).trim().length, `${page} is empty`).toBeGreaterThan(500);
    }
  });

  it("carries a currency header and a published re-open trigger", () => {
    // The same two properties the hand bucket is defined by, and for the same reason: a record
    // nobody can date and nobody can falsify is a record nobody can tell is stale. This page
    // held the spec's dated dispositions for a release window with neither.
    for (const page of EVIDENCE_PAGES) {
      const head = lines(afterFrontmatter(read(page))).slice(0, 8).join("\n");

      expect(head, `${page} has no currency header`).toMatch(CURRENCY_HEADER);
      expect(head, `${page} publishes no re-open trigger`).toMatch(/Re-open when:/);
      expect(head, `${page}'s re-open trigger names no check`).toMatch(/test\/docsPages\.test\.ts/);
    }
  });

  it("dates the bucket at this pass, and no page later than it", () => {
    const stamped = EVIDENCE_PAGES.map((page) => {
      const head = lines(afterFrontmatter(read(page))).slice(0, 8).join("\n");
      return { page, reattested: CURRENCY_HEADER.exec(head)?.[1] };
    });

    for (const { page, reattested } of stamped) {
      expect(
        reattested,
        `${page} carries a currency header with no re-attestation date — stamp it with a ` +
          `"Re-attested <date>" clause naming the pass that re-read it against its sources`,
      ).toBeDefined();
      expect(
        (reattested ?? "") <= EVIDENCE_REATTESTATION_DATE,
        `${page} re-attests to ${reattested ?? ""}, later than the ` +
          `${EVIDENCE_REATTESTATION_DATE} pass it ships in`,
      ).toBe(true);
    }
    expect(
      newest(stamped.map(({ reattested }) => reattested ?? "")),
      `no evidence page was re-attested at ${EVIDENCE_REATTESTATION_DATE} — stamp the pages ` +
        `this pass re-read, or move EVIDENCE_REATTESTATION_DATE to the pass that happened`,
    ).toBe(EVIDENCE_REATTESTATION_DATE);
  });

  it("names no reserved token", () => {
    for (const page of EVIDENCE_PAGES) {
      const text = read(page).toLowerCase();
      for (const token of RESERVED_TOKENS) {
        expect(text.includes(token), `${page} names a reserved token`).toBe(false);
      }
    }
  });

  it("cites every outside source over https, and links inside the tree otherwise", () => {
    // The allowlist rule the hand bucket applies cannot apply here (see CLIENT_CONTRACTS), so
    // what is checked is what an evidence citation must be either way: a real address, not a
    // bare domain in prose, and a tree link that resolves.
    for (const page of EVIDENCE_PAGES) {
      const text = read(page);
      for (const url of text.match(ABSOLUTE_URLS) ?? []) {
        expect(url, `${page} cites a source over a non-https scheme`).toMatch(/^https:\/\//);
      }
      for (const target of linkTargets(text)) {
        if (target.startsWith("https://") || target.startsWith("#")) continue;
        expect(target, `${page} link is root- or protocol-absolute`).not.toMatch(/^\//);
        expect(existsSync(resolveTarget(page, target)), `${page} links missing ${target}`).toBe(
          true,
        );
      }
    }
  });

  it("states all three Codex hook-loading steps and the headless result, with their dates", () => {
    // DOC-1. The page described Codex hooks as command strings plus `/hooks` trust for the
    // whole window in which the adapter shipped a feature flag the page never named, and the
    // emitted hooks were inert on the one lane anybody measured. Each literal below is a fact
    // with a source: the three loading steps from the vendor pages the bullet cites, the
    // headless result from the 2026-09-15 fixture measurement.
    const text = read(CLIENT_CONTRACTS);
    for (const fact of CODEX_HOOK_FACTS) {
      expect(text, `${CLIENT_CONTRACTS} does not state \`${fact}\``).toContain(fact);
    }
    // Dated, because an undated vendor fact is the shape this page keeps going stale in.
    expect(text, "the Codex measurement carries no date").toContain("2026-09-15");
    expect(text, "the vendor re-read carries no date").toContain("2026-09-17");
    // The honest gap, kept in words: the hooks page states a default the measurement never
    // tested, so the page must not assert one of its own.
    expect(text, "the page asserts a `features.hooks` default it never measured").toMatch(
      /never ran without the key/,
    );
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

  // Renamed on each growth of the advertised surface — "seven verbs" before `workspace`, "eight
  // verbs" before `worktree`: the name states the count, and the array below is what the
  // assertion actually reads.
  //
  // This is the SECOND hand-maintained copy of the surface, the getting-started case below
  // holding the first. Both are literal lists rather than derivations from `COMMANDS`, so a verb
  // that joins the CLI and not these two arrays leaves both pages understating the surface with
  // nothing failing — which is exactly how README went on saying "seven verbs" while `workspace`
  // shipped. A verb lands in `src/cli.ts` and in both arrays, in that order.
  it("states the command surface — ten verbs plus the plumbing verbs", () => {
    const text = read(README);
    const ADVERTISED = [
      "init",
      "sync",
      "check",
      "validate",
      "add",
      "config",
      "workspace",
      "worktree",
      // TEST CHANGE, justified: `plugin` joined the advertised surface in `src/cli.ts` between
      // `worktree` and `clean`, and this array asserts ORDER as well as membership — so the
      // verb lands here in the CLI's own position, not appended where it would read as a
      // reshuffle of the list a reader scans.
      "plugin",
      "clean",
    ];
    // TEST CHANGE, justified (strictly stronger): nine `toContain` calls over the
    // WHOLE page became one equality on the `·` list itself. Containment could
    // not see the failure it was written for — a verb dropped from the list a
    // reader scans, while still named in the paragraph under it or in a link,
    // passed every one of the nine. Order is asserted too: the list is the
    // order `src/cli.ts` advertises, and a reshuffle is a change to the surface
    // a reader reads it as.
    const commands = text.split(/^(?=## )/m).find((part) => part.startsWith("## Commands")) ?? "";
    expect(commands, "README has no `## Commands` section").not.toBe("");
    const run = /((?:`[a-z-]+` · )+`[a-z-]+`) — /.exec(commands.replaceAll("\n", " "))?.[1];
    expect(run, "README's `## Commands` section carries no `·` verb list").toBeDefined();
    const listed = (run ?? "").split(" · ").map((verb) => verb.replaceAll("`", ""));
    expect(listed, "README's `·` verb list is not the advertised surface").toEqual(ADVERTISED);
    // The count WORD beside the list is still hand-typed; the length assertion
    // next to it is what makes the two disagreeing visible.
    expect(listed).toHaveLength(10);
    expect(commands, "README's verb count word does not match its own list").toContain(
      "ten verbs",
    );
    expect(text).toContain("`learn`");
    // TEST CHANGE, justified: `handoff` joined `learn` behind the advertised surface, so
    // "the plumbing verb" is no longer one verb. The `learn` pin still holds and stays; this
    // mirrors it so a README that drops either hidden verb fails the way dropping `learn` did.
    expect(text).toContain("`handoff`");
    // TEST CHANGE, justified: `ledger` joined `learn` and `handoff` behind the advertised surface
    // as the third plumbing verb (the one serialized writer of a run's findings ledger), so the
    // README names three hidden verbs. This mirrors the two pins above, so a README that drops it
    // fails the way dropping `learn` or `handoff` does.
    expect(text).toContain("`ledger`");
  });

  it("is indexed with the same verb count it states itself", () => {
    // `llms.txt`'s README row restates the verb count in its own words, and
    // that row is rendered from a literal in `src/cli/docs/llmsIndex.ts` — one
    // the plugin route did not move, so the index went on publishing "nine
    // verbs" beside a README that said ten. Both count words are read off the
    // pages rather than typed here; the README's own is held to its list
    // above, so this is the index held to the README.
    const readme = read(README);
    const index = read("llms.txt");
    const stated = /\b([a-z]+) verbs\b/.exec(readme)?.[1];
    expect(stated, "README states no verb count").toBeDefined();
    const row = index.split("\n").find((line) => line.includes("](README.md)")) ?? "";
    expect(row, "llms.txt has no README row").not.toBe("");
    const indexed = /\b([a-z]+) verbs\b/.exec(row)?.[1];
    expect(indexed, "llms.txt's README row states no verb count").toBeDefined();
    expect(indexed, "llms.txt's README row disagrees with README about the verb count").toBe(
      stated,
    );
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

/**
 * The eval run of record as README and the doctrine type it: `[run N](…), the X release run`,
 * and while the run is carried, `carried to Y under the set's incremental rule`. The measurements
 * page renders the same claim from `src/cli/docs/measurements.ts`, whose suite refuses a run
 * carried to its own release; these two pages type it by hand, so they are held here to the
 * generator's constants and passed through the same guard. Read off whitespace-collapsed text,
 * because the pages break the clause at different words and README puts a comma before
 * "carried" where the doctrine does not.
 */
const RUN_OF_RECORD_PAGES: readonly string[] = [README, DOCTRINE];

const RUN_OF_RECORD_CLAIM =
  /\[run (\d+)\]\((?:\.\.\/)?(evals\/runs\/[^)\s]+)\),? the (\d+\.\d+\.\d+) release run/;
const CARRIED_CLAUSE =
  /the (\d+\.\d+\.\d+) release run,? carried to (\d+\.\d+\.\d+) under the set's incremental rule/;

const collapsed = (text: string): string => text.replace(/\s+/g, " ");

describe("the eval run of record on the hand pages", () => {
  // Survives the release that runs the set: that release moves the generator's run and release,
  // and a hand page left naming the old pair fails here rather than going stale.
  it.each(RUN_OF_RECORD_PAGES)("%s names the generator's run and release", (page) => {
    const claim = RUN_OF_RECORD_CLAIM.exec(collapsed(read(page)));
    expect(claim, `${page} states no "[run N](…), the X release run" claim`).not.toBeNull();
    const [, run, path, release] = claim ?? [];
    expect(path, `${page} links a run that is not the run of record`).toBe(RUN_OF_RECORD_PATH);
    expect(run, `${page} numbers the run apart from its path`).toBe(
      /-run-(\d+)\//.exec(RUN_OF_RECORD_PATH)?.[1],
    );
    expect(release, `${page} names another release run than the generator`).toBe(
      RUN_OF_RECORD_RELEASE,
    );
  });

  // Deleted with RUN_OF_RECORD_CARRIED_TO, together with the pages' clause, by the release that
  // runs the set — the guard's own message says so. While the constant stands, a page without the
  // clause disagrees with the generator and fails; an equal pair fails through carriedToRelease
  // first, so it reads the same instruction the measurements page does.
  it.each(RUN_OF_RECORD_PAGES)("%s carries the run to the generator's release", (page) => {
    const clause = CARRIED_CLAUSE.exec(collapsed(read(page)));
    expect(
      clause,
      `${page} does not say the run is carried to ${RUN_OF_RECORD_CARRIED_TO}; the generator does`,
    ).not.toBeNull();
    const [, runRelease = "", carriedTo = ""] = clause ?? [];
    expect(carriedToRelease(runRelease, carriedTo)).toBe(RUN_OF_RECORD_CARRIED_TO);
    expect(runRelease, `${page} carries another release run than the generator`).toBe(
      RUN_OF_RECORD_RELEASE,
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
 *
 * TEST CHANGE, justified: the relative path is normalised to POSIX before it is compared or
 * returned. `relative()` emits native separators, so on Windows `declaredIn` — a POSIX literal at
 * every call site — never matched the declaring file, the declaration was never stripped from it,
 * and the file's own declaration counted as a reference. That failed CI's Windows leg on
 * "holds the in-process check's disclosure to the call graph, both ways": `checkToolAccess` read as
 * wired, so the page's true sentence "it has no production caller" was rejected. The Linux legs
 * passed, which is why the defect was latent until a page said the thing the inverse branch checks.
 * A logical path crossing a comparison is POSIX here, per the learning
 * `the-local-test-gate-is-weaker-than-ci`.
 */
function referencesTo(symbol: string, declaredIn: string): string[] {
  const declaration = new RegExp(
    String.raw`(?:export\s+)?(?:async\s+)?(?:function|const|class|interface|type|enum)\s+${symbol}\b`,
    "g",
  );
  const found: string[] = [];
  for (const file of sourceFiles()) {
    const relPath = relative(REPO_ROOT, file).replaceAll("\\", "/");
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

    // TEST CHANGE, justified: the mapping obligation MOVED rather than lapsed, so the
    // assertion moves with it. The page used to be held to admitting that "no threat-model
    // document exists to re-run" — an assertion that can only pass while the document is
    // missing, and that would have failed the change that wrote it. What replaces it is the
    // same obligation from the other side: the mapping exists, and SECURITY.md reaches it. The
    // "re-run a pass" negative below is untouched — the failure it was written for (promising
    // to re-run something nobody wrote) is still a failure, and a page that links the mapping
    // while promising that re-run still fails here.
    expect(text, "SECURITY.md does not link the standards mapping it says is written").toContain(
      `](${SECURITY_MAPPING})`,
    );
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
    // The one live bound is stated as the live one, in the unit it actually counts.
    //
    // TEST CHANGE, justified: the unit depends on which caller applies the constant, and this
    // pinned only one of them while the page named the other. `MAX_USER_CONTENT_LENGTH`
    // (`src/guard/promptGuard.ts:49`) bounds a user-content overlay body in CHARACTERS —
    // `src/content/userContent.ts:626` measures `text.length`, `src/content/catalog.ts:1141`
    // compares the same, and `src/cli/commands/validate.ts:862` prints "over the N-character
    // ceiling". The stdin path in `src/cli/commands/learn.ts:213` is the byte one, counting
    // `buffer.byteLength`. So both literals are pinned: the character form for the user-content
    // ceiling the unwired-controls bullet names, the byte form for the stdin row in the control
    // table. The page said "byte" in both places, which over-claimed the overlay bound's unit.
    expect(text).toContain("MAX_USER_CONTENT_LENGTH");
    expect(text).toMatch(/250 000-character ceiling/);
    expect(text).toMatch(/250 000-byte ceiling/);
    // `ledger append --stdin` is the third byte-ceiling caller (`src/cli/commands/ledger.ts`,
    // `readAll`), named both in the control table and in the bounded-IO bullet.
    expect(text.replace(/\s+/g, " ")).toContain(
      "`learn`, `handoff` and `ledger append --stdin` reads apply it as a byte one",
    );
    expect(text).toContain("applied over stdin in `src/cli/commands/learn.ts`, `src/cli/commands/handoff.ts` and `src/cli/commands/ledger.ts`");
  });

  it("states the resume card's re-entry surface: what screens it and what it does not defend", () => {
    // After a compaction the session-start hook and `stamity ledger status` read the record
    // head, ledger ids, report names and lane paths back into the model's context and the
    // terminal. The table names the control at the symbols that run it, and the residual
    // names the screen subset and the unscreened files the card points at.
    const table = text.slice(
      text.indexOf("## What the engine defends today"),
      text.indexOf("## Network and data handling"),
    );
    const row = table.split("\n").find((line) => line.includes("through the resume card")) ?? "";
    expect(row, "the control table has no resume card row").not.toBe("");
    expect(row).toContain("`src/runs/resumeCard.ts::screenCard`");
    expect(row).toContain("`src/runs/cardSource.ts::buildResumeCardSource`");
    expect(row).toMatch(/never a finding's text/);
    expect(row).toMatch(/session-start subset/);
    expect(row).toMatch(/meet no screen/);
  });

  it("covers the four surfaces the phase claims, and the limits", () => {
    expect(text).toMatch(/trust ladder/i);
    expect(text).toMatch(/deny-scan/i);
    expect(text).toMatch(/allowlist/i);
    expect(text).toMatch(/atomic rename/i);
    expect(text).toMatch(/does not defend/i);
  });
});

/**
 * Every backticked `src/…` address on a page, held to the check SECURITY.md's own control table
 * is held to: a `file::symbol` address whose file exists and whose symbol is DECLARED there,
 * and never a `file:line` address, which drifts with the edit above it and cannot be checked.
 *
 * Written as a helper rather than folded into the SECURITY case above, because the two pages
 * make different claims with the same addresses. SECURITY.md's table claims a control the
 * engine RUNS, so its case also holds each address to the call graph. The mapping page states
 * controls and gaps side by side, and a gap row's whole point is an address nothing calls — so
 * holding that page to the call graph would refuse exactly the rows it exists to publish.
 */
function assertSymbolAddressesResolve(page: string, text: string, minimum: number): void {
  const pointers = [...text.matchAll(/`([^`]+)`/g)]
    .map((match) => match[1] ?? "")
    .filter((span) => span.startsWith("src/"));

  let symbolsChecked = 0;
  for (const pointer of new Set(pointers)) {
    expect(pointer, `${page} cites ${pointer} by line number`).not.toMatch(/:\d+$/);
    const [file = "", symbol] = pointer.split("::");
    expect(existsSync(join(REPO_ROOT, file)), `${page} cites missing ${file}`).toBe(true);
    if (symbol === undefined) continue;
    symbolsChecked += 1;
    const declared = new RegExp(
      `\\b(?:function|const|class|interface|type|enum)\\s+${symbol}\\b|\\b${symbol}\\s*[(:=]`,
    );
    expect(declared.test(read(file)), `${file} declares no ${symbol}`).toBe(true);
  }
  expect(symbolsChecked, `${page} names no enclosing symbols`).toBeGreaterThanOrEqual(minimum);
}

/** `ASI01`…`ASI10` — a catalogue's ten ids, built from its prefix rather than typed out. */
const decade = (prefix: string): string[] =>
  Array.from({ length: 10 }, (_, index) => `${prefix}${String(index + 1).padStart(2, "0")}`);

/**
 * The standards mapping — the page SECURITY.md's "Standards mapping" section used to stand in
 * for with an admission that it was unwritten.
 *
 * What is asserted here is what makes a crosswalk checkable rather than decorative: every
 * control address resolves the way the security page's do, every catalogue it maps to is pinned
 * to an edition (a mapping to "OWASP ASI" with no edition maps to a moving target), and the
 * structure a reader navigates by — one heading per surface, and the gaps under a heading of
 * their own rather than dissolved into the rows they qualify.
 */
describe("docs/security-mapping.md", () => {
  const text = read(SECURITY_MAPPING);

  /** The surface section alone, so a `###` elsewhere on the page is not counted as a surface. */
  const surfaces = (): string => {
    const start = text.indexOf("## The surfaces");
    const end = text.indexOf("## Gaps");
    expect(start, "the mapping page has no `## The surfaces` section").toBeGreaterThanOrEqual(0);
    expect(end, "the mapping page has no `## Gaps` section").toBeGreaterThan(start);
    return text.slice(start, end);
  };

  it("addresses every control by a symbol that exists in the file it names", () => {
    assertSymbolAddressesResolve(SECURITY_MAPPING, text, 20);
  });

  it("carries one heading per surface, and states its gaps under their own heading", () => {
    const headings = [...surfaces().matchAll(/^### (.+)$/gm)].map((match) => match[1] ?? "");
    // Seven: the six engine surfaces plus the release publish path, which is a surface of this
    // repository rather than of the emitted setup and is labelled as one.
    expect(headings, "the surface count moved without this pin moving").toHaveLength(7);
    for (const heading of headings) {
      expect(heading.trim().length, "a surface heading is empty").toBeGreaterThan(0);
    }
    expect(text, "the mapping page states no gaps section").toMatch(/^## Gaps/m);
  });

  it("pins every catalogue it maps to an edition", () => {
    // The ids ARE the mapping — a row mapping to a catalogue while naming none of its ids maps
    // to nothing — so each catalogue's full id set is asserted rather than a sample.
    for (const id of [...decade("ASI"), ...decade("LLM"), ...decade("A")]) {
      expect(text, `the mapping page never names ${id}`).toContain(id);
    }
    for (const subcategory of [
      "GOVERN 1.1",
      "GOVERN 1.6",
      "MAP 1.1",
      "MEASURE 2.7",
      "MANAGE 2.1",
      "MANAGE 3.1",
      "MANAGE 3.2",
    ]) {
      expect(text, `the mapping page never names ${subcategory}`).toContain(subcategory);
    }
    // And the editions those ids belong to. A crosswalk with no edition is a crosswalk to
    // whatever the catalogue says today, which is the failure this page was written against.
    for (const edition of [
      "2025-12-09",
      "OWASP Top 10 for LLM Applications 2025",
      "OWASP Top 10:2021",
      "NIST AI 100-1",
      "NIST AI 600-1",
      "2024-04-15",
      "2025-05-22",
    ]) {
      expect(text, `the mapping page cites ${edition} without an edition`).toContain(edition);
    }
    // The read date is what makes every one of those falsifiable.
    expect(text, "the mapping page states no catalogue read date").toContain("read on 2026-09-14");
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
      "node scripts/generate-plugin-packages.mjs",
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
 * prove the page still SAYS the thing it was written to say, and five of these
 * nine make a claim about a mechanism that can move underneath it: the doctor's
 * probe set, the trust ladder's rungs, whether signature verification is armed,
 * what the predecessor's own uninstall verb destroys, and the upstream lane's
 * verb and outcome vocabulary. So each assertion below reads the mechanism
 * rather than a second copy of it, the way the README corpus counts do.
 *
 * TEST CHANGE, justified (strictly stronger): the workflow guide's gap closed, so
 * this paragraph reads three rather than four. Its touchpoint table is now a
 * mirror of the charter's index under the case below, and the reason it had no
 * bespoke case — "`AGENTS.md` owns it rather than any symbol this file can read"
 * — no longer holds: the corpus template `content/charter/stamity-charter.md` is
 * a file this suite can read, and the two cells that had already drifted against
 * it (`/st-spec` truncated after the semicolon, `/st-plan` re-punctuated from
 * parentheses to dashes) are what a hand restatement costs.
 *
 * TEST CHANGE, justified (strictly stronger): two more of those gaps closed.
 * The customization guide's override-tree table and advisory thresholds are now
 * read off `src/content/userContent.ts`, and the workspaces guide's subcommand
 * list off `src/cli/commands/workspace.ts`, both in cases below.
 *
 * One guide has no bespoke case here, and the reason is not that its claim
 * cannot be reached. The doctrine page is the other shape: it states the
 * reasoning behind the corpus and cites the surfaces that enforce it, and each
 * of those surfaces is already pinned where it lives — the charter cap and the
 * always-on ratchet in `test/corpus/invariants.test.ts`, the currency headers
 * above, the roster in `test/ci/docsRoster.test.ts` — so a case here would
 * re-assert them from a page rather than from the mechanism. All three are held
 * to the bucket-wide contract above and to their own re-open triggers meanwhile.
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

  it("the doctrine page counts the hand bucket the way this suite does", () => {
    // The page names the bucket this file gates — "the N guides under docs/"
    // and "holds all M" — and both numbers are prose, not derivations. They
    // read "ten" and "thirteen" for the whole plugin-lifecycle package after
    // the plugins guide had made them eleven and fourteen; a guide that lands
    // now moves them here or fails here.
    // Whitespace-tolerant across the line break: a re-wrap is not a count change.
    const text = read(DOCTRINE).replace(/\s+/g, " ");
    expect(text).toContain(`the ${countWord(GUIDES.length)} guides under \`docs/\``);
    expect(text).toContain(`holds all ${countWord(HAND_PAGES.length)} to that pair`);
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

  it("the customization guide's override tree and thresholds are the module's, not a copy", () => {
    // Two tables, both restatements of `src/content/userContent.ts`: where an
    // override for each class lives, and the advisory line count each class is
    // held to. Neither is derived, so both drift the moment a class moves or a
    // threshold is retuned — and both are exactly what an author reads the page
    // for. Read from the module here so the page cannot quietly disagree.
    const text = read(CUSTOMIZATION);
    for (const [klass, { dir, layout }] of Object.entries(CLASS_LAYOUT)) {
      // `SKILL_FILE` is the module's own name for the readable file inside a
      // skill directory; the file/directory split is the module's too.
      const tail = layout === "directory" ? `<id>/${SKILL_FILE}` : "<id>.md";
      expect(text, `the customization guide misfiles a ${klass} override`).toContain(
        `\`.stamity/overrides/${dir}/${tail}\``,
      );
    }
    for (const [klass, limit] of Object.entries(LEAN_LINE_THRESHOLDS)) {
      expect(text, `the customization guide's ${klass} threshold is not the module's`).toContain(
        `| ${klass} | ${String(limit)} |`,
      );
    }
    // Non-degenerate: the loops above pass vacuously over an empty record.
    expect(Object.keys(CLASS_LAYOUT)).toHaveLength(4);
    expect(Object.keys(LEAN_LINE_THRESHOLDS)).toHaveLength(4);
  });

  it("the workspaces guide names every subcommand the verb actually takes", () => {
    // The guide is the only place the three subcommands are described, and the
    // set is a closed literal in the command module — so a fourth subcommand,
    // or one retired, moves nothing here on its own. Read the literal out of
    // the source rather than importing it: `SUBCOMMANDS` is module-private, and
    // a test is not a reason to widen a module's surface.
    const source = read("src/cli/commands/workspace.ts");
    const declared = /const SUBCOMMANDS = \[([^\]]+)\] as const;/.exec(source)?.[1];
    expect(declared, "the workspace command no longer declares a closed SUBCOMMANDS set").toBeDefined();
    const subcommands = [...(declared ?? "").matchAll(/"([a-z-]+)"/g)].map((match) => match[1]);
    expect(subcommands, "no workspace subcommand was read out of the source").not.toHaveLength(0);

    const guide = read(WORKSPACES);
    for (const subcommand of subcommands) {
      expect(guide, `the workspaces guide never mentions \`workspace ${subcommand}\``).toContain(
        `workspace ${subcommand}`,
      );
      expect(guide, `the workspaces guide never shows how to run \`${subcommand}\``).toContain(
        `stamity workspace ${subcommand}`,
      );
    }
    // The page's own count sentence is the second half of the same claim: it
    // says how many there are, and nothing else recomputes it.
    expect(guide, "the workspaces guide's subcommand count is not the source's").toContain(
      subcommands.length === 3 ? "three subcommands" : `${String(subcommands.length)} subcommands`,
    );
  });

  it("the enterprise-forks guide names every lane verb and every exit-1 outcome", () => {
    // Two literal lists on one page: the verbs `scripts/upstream.mjs` takes, and the outcome
    // vocabulary a fork reads its exit status through. Both are closed literals in that script,
    // so a verb or an outcome added there and not here leaves the page describing a surface the
    // lane no longer has — the second hand-maintained copy this suite exists to catch. Read as
    // text rather than imported, the way the workspace subcommands are: the claim is about the
    // literal in the source, and the page is held to it rather than to a copy of it.
    const source = read("scripts/upstream.mjs");
    const guide = read(ENTERPRISE_FORKS);

    const declared = /export const VERBS = \[([^\]]+)\]/.exec(source)?.[1];
    expect(declared, "the lane no longer declares a closed VERBS list").toBeDefined();
    const verbs = [...(declared ?? "").matchAll(/'([a-z]+)'/g)].map((match) => match[1] ?? "");
    expect(verbs.length, "no lane verb was read out of the source").toBeGreaterThanOrEqual(7);
    for (const verb of verbs) {
      expect(guide, `the enterprise-forks guide never names \`${verb}\``).toContain(`\`${verb}\``);
    }

    // Only the exit-1 outcomes, and that is the claim rather than a convenience: those are the
    // states a fork has to act on, and this page's table is where it reads what each one means.
    // The exit-0 pair `aborted` and `help` is described by the verbs that produce them.
    const table = /export const OUTCOMES = Object\.freeze\(\{([\s\S]*?)^\}\)/m.exec(source)?.[1];
    expect(table, "the lane no longer declares an OUTCOMES table").toBeDefined();
    const actionable = [...(table ?? "").matchAll(/^\s*'?([a-z][a-z-]*)'?:\s*1,/gm)].map(
      (match) => match[1] ?? "",
    );
    expect(actionable.length, "no exit-1 outcome was read out of the source").toBeGreaterThan(0);
    for (const outcome of actionable) {
      expect(guide, `the enterprise-forks guide never names \`${outcome}\``).toContain(
        `\`${outcome}\``,
      );
    }
  });

  it("the enterprise-forks guide states the DCO check's walk and its one exemption", () => {
    // ADDED with the fork-lane audit's inherited-checks warning (plan 008, unit A1b). This page
    // is where a fork reads why an update pull request of several hundred upstream commits it
    // did not write now passes an inherited required check that used to refuse it for its
    // length, and what the single exemption costs. Held against the job itself, so the page
    // cannot go on describing a rule the workflow stopped applying.
    const guide = read(ENTERPRISE_FORKS);
    const job = read(".github/workflows/pr-checks.yml");

    expect(job, "the DCO job no longer reconciles its listing against total_commits").toContain(
      "total_commits",
    );
    expect(guide, "the guide never says the listing is walked to its declared length").toContain(
      "`total_commits`",
    );
    // CHANGED with W-A1b-1: the pin moved with the sentence. The exemption measured
    // EXISTENCE, which the commits endpoint answers for any sha in the upstream's fork
    // network; it now measures ancestry against the upstream's default branch, and the page
    // has to say the rule the job applies.
    expect(flowed(guide), "the guide never states the exemption's one condition").toContain(
      flowed("reachable\nfrom the default branch of the upstream repository your `.stamity/upstream.json` names"),
    );
    expect(flowed(guide), "the guide never says why existence was not enough").toContain(
      flowed("Reachability, and not mere\nexistence"),
    );
    expect(guide, "the guide never limits the exemption to an upstream on GitHub").toContain(
      "names a repository on GitHub",
    );
    expect(guide, "the guide never says where the configuration is read from").toContain(
      "read from the pull request's base branch",
    );
    // The fork-lane minor beside it: the lane writes the trailer, and a written trailer is not
    // the certification a person makes by submitting the contribution.
    expect(flowed(guide), "the guide still reads the written trailer as a person's sign-off").toContain(
      flowed("not a certification by the person it\nnames"),
    );
  });

  it("the enterprise-forks guide states what a rename carries and what it does not", () => {
    // Three claims a downstream ACTS on, each of which the 2026-09-17 audit found wrong or
    // missing: the identity pins it would have to edit (FORK-3), the host the regenerate
    // step really requires (FORK-5), and the baseline tag the bootstrap check asserts
    // (DOC-2). They are prose, so nothing else in the suite can notice them going stale —
    // and each one is the sentence a reader follows rather than a word from it.
    const guide = read(ENTERPRISE_FORKS);

    // The rename: derived, not edited. The rule names the file that makes it true, so a
    // reader can check the claim instead of trusting it.
    expect(guide, "the guide never names the identity helper the suites read").toContain(
      "`test/support/identity.ts`",
    );
    expect(guide, "the guide never says a rename needs no test edit").toContain(
      "Your rename needs no test edit at all.",
    );
    // The two exceptions the same paragraph has to carry, or the rule above is a trap: the
    // presets hold the identity as data, and nothing derives them.
    for (const preset of ["`renovate/plugins.json`", "`renovate/companion.json`"]) {
      expect(guide, `the guide never names ${preset} as identity data`).toContain(preset);
    }
    // What a rename carries on its own, named so a reader stops looking for it.
    expect(guide, "the guide never says the tarball smoke follows the renamed name").toContain(
      "`scripts/tarball-smoke.mjs`",
    );

    // The portability boundary, beside the portability claim rather than somewhere else.
    expect(guide, "the guide still calls the generators portable without naming the host").toContain(
      "`scripts/distribution-identity.mjs`, which accepts a URL on the public GitHub host and",
    );

    // The bootstrap baseline: a variable the reader sets, never a frozen release tag.
    expect(guide, "the bootstrap check no longer names its baseline through a variable").toContain(
      'git merge-base --is-ancestor "$STAMITY_BASELINE_TAG" HEAD',
    );
    expect(guide, "the bootstrap check still hardcodes the 1.5.0 baseline").not.toContain(
      "--is-ancestor v1.5.0",    );
  });

  it("the enterprise-forks guide states the plugin-distribution route it tells a fork to run", () => {
    // Left for this unit by the release-workflow one, which wrote the section and had no docs
    // pin to hang it on. Three claims a fork ACTS on, and all three are checkable rather than
    // atmospheric: the builder it runs, the `package.json` block that decides what the built
    // catalogs say, and why the branch push is forced. Each is read from the mechanism where
    // one exists, so the pin fails when the mechanism moves rather than when the prose does.
    const guide = read(ENTERPRISE_FORKS);

    // The two builders, asserted to EXIST as well as to be named: a renamed script would
    // otherwise leave the guide pointing at a command a reader cannot run.
    for (const script of [
      "scripts/build-plugin-runtime.mjs",
      "scripts/build-plugin-distribution.mjs",
    ]) {
      expect(guide, `the fork guide never names \`${script}\``).toContain(script);
      expect(
        existsSync(join(REPO_ROOT, script)),
        `the fork guide names missing ${script}`,
      ).toBe(true);
    }

    // The configuration block, read off the validator that decides the key set rather than
    // transcribed here: a fifth key would be one the guide does not mention, and a dropped one
    // would be a key the guide still tells a fork to set.
    const identity = read("scripts/distribution-identity.mjs");
    const declared = /const DISTRIBUTION_KEYS = \[([^\]]*)\]/.exec(identity)?.[1];
    expect(declared, "distribution-identity.mjs has no DISTRIBUTION_KEYS to read").not.toBeUndefined();
    const keys = [...(declared ?? "").matchAll(/'([^']*)'/g)].map((match) => match[1] ?? "");
    expect(keys.length, "the key list read as empty, so the loop below asserts nothing").toBe(4);
    expect(guide, "the fork guide never names the `stamity.distribution` block").toContain(
      "`stamity.distribution`",
    );
    for (const key of keys) {
      // The key as a code span, allowing the path form the guide uses for the one key whose
      // value is a map (`sources.<client>`). The alternative — demanding the bare key — would
      // make the guide name `sources` twice to satisfy a test rather than a reader.
      expect(guide, `the fork guide omits the \`${key}\` key a fork has to set`).toMatch(
        new RegExp(`\`${key}[.\`]`),
      );
    }

    // The force semantics: the flag AND the reason. A guide that printed `--force` without
    // saying why would read as a shortcut, which is the one reading the section exists to deny.
    expect(guide, "the fork guide never shows the forced branch push").toContain(
      "git push --force <your remote> HEAD:refs/heads/plugin-dist",
    );
    expect(guide, "the fork guide never says why the branch push is forced").toContain(
      "`--force` on the branch is the intended shape rather than a shortcut",
    );
    expect(guide, "the fork guide never says the tag is what keeps history").toMatch(
      /tag\*{0,2} is what keeps history/,
    );
  });

  it("the enterprise-forks guide sets a fork's identity with the one command, not a copy-paste block", () => {
    // Plan 010, unit docs-guides (REQ-PLUGIN-028). The identity step was a hand-typed block whose
    // `node -e` rewrote the two presets with a plain `replaceAll`, which a rerun applied twice to a
    // slug carrying the canonical route as a prefix. `scripts/fork-identity.mjs` replaced it. The
    // pin reads the fenced block of that one subsection, so the copy-paste coming back fails here
    // instead of passing on a mention of the script somewhere else on the page.
    const script = "scripts/fork-identity.mjs";
    expect(existsSync(join(REPO_ROOT, script)), `the fork guide names missing ${script}`).toBe(true);
    const section = sectionOf(read(ENTERPRISE_FORKS), "### Set the private package's identity");
    const block = fencedBlocksOf(section, "sh")[0] ?? "";
    expect(block, "the identity step carries no sh block").not.toBe("");
    expect(block, "the identity block does not run the identity script").toContain(`node ${script} --repository`);
    expect(block, "the identity block still carries a hand-typed node -e rewrite").not.toContain("node -e");
    // The lockfile is the one identity-bearing file the script leaves alone, to stay offline.
    expect(block, "the identity block no longer refreshes the lockfile's name").toContain(
      "npm install --package-lock-only",
    );
    // Both flags the script takes beyond the repository, named where a reader chooses them.
    for (const flag of ["--registry", "--scope"]) {
      expect(section, `the identity step never says when to pass ${flag}`).toContain(`\`${flag}`);
    }
  });

  it("the enterprise-forks guide names every variable and secret the fork release workflow reads, and no other", () => {
    // Plan 010, unit docs-guides (REQ-PLUGIN-027). A fork arms `.github/workflows/fork-release.yml`
    // by setting exactly the names the workflow reads, so the pin runs both ways: a name the
    // workflow gains that the guide never tells a fork to set leaves the release inert or
    // credential-less, and a name the guide prints that the workflow never reads is a setting
    // that does nothing. Read off the workflow's own `vars.`/`secrets.` expressions, never typed.
    const workflow = read(".github/workflows/fork-release.yml");
    const reads = new Set(
      [...workflow.matchAll(/\b(?:vars|secrets)\.([A-Za-z_][A-Za-z0-9_]*)/g)].map((match) => match[1] ?? ""),
    );
    // Non-degenerate: the three variables, the registry secret and the per-run token.
    expect(reads.size, "the workflow read as naming almost nothing").toBeGreaterThanOrEqual(5);
    const section = sectionOf(read(ENTERPRISE_FORKS), "## Release your fork");
    expect(section, "the fork guide has no release section").not.toBe("");
    for (const name of reads) {
      expect(section, `the release section never names \`${name}\``).toContain(`\`${name}\``);
    }
    const printed = new Set([...section.matchAll(/`(STAMITY_[A-Z0-9_]+)`/g)].map((match) => match[1] ?? ""));
    expect(printed.size, "the release section names no STAMITY_ setting").toBeGreaterThan(0);
    for (const name of printed) {
      expect(reads.has(name), `the release section names \`${name}\`, which the workflow never reads`).toBe(true);
    }
  });

  it("the enterprise-forks guide's managed-settings block is the renderer's own output", () => {
    // Plan 010, unit docs-guides (REQ-PLUGIN-029). The template's allowlist entry must equal the
    // declared source field for field, or the client admits no marketplace at all, so a block an
    // admin copies from the page is held to `renderClaudeManagedSettings` for the canonical
    // identity. The ref is read from the block itself, so a version bump moves the page without
    // breaking the pin — and a block whose two refs disagree still fails, because the renderer
    // writes one ref into both places.
    const section = sectionOf(read(ENTERPRISE_FORKS), "## Roll the plugin out to your organization");
    const block = fencedBlocksOf(section, "json")[0];
    expect(block, "the rollout section carries no json block").toBeDefined();
    const shown = JSON.parse(block ?? "{}") as {
      extraKnownMarketplaces?: Record<string, { source?: { ref?: unknown } }>;
    };
    const ref = Object.values(shown.extraKnownMarketplaces ?? {})[0]?.source?.ref;
    expect(typeof ref, "the block's declared marketplace carries no ref").toBe("string");
    const pkg = {
      name: SCOPED_PACKAGE,
      repository: { type: "git", url: `git+https://github.com/${OWNER}/${PRODUCT}.git` },
    };
    const identity = buildCatalogIdentity(pkg, resolveDistributionIdentity(pkg)) as Record<string, unknown>;
    const rendered = JSON.parse(JSON.stringify(renderClaudeManagedSettings(identity, { ref }))) as Record<
      string,
      unknown
    >;
    expect(Object.keys(rendered).length, "the renderer rendered no keys").toBe(4);
    expect(shown, "the page's template is not the renderer's output").toEqual(rendered);
    expect(Object.keys(shown), "the page's template reorders the renderer's keys").toEqual(Object.keys(rendered));
  });

  it("the plugins guide adds a Codex marketplace only at a ref", () => {
    // Ledger build/18 and review/61 (plan 010). Measured on codex-cli 0.155.1: a Codex marketplace
    // added with no `--ref` checks out the default branch, which carries no Codex catalog, falls
    // back to that branch's Claude catalog and installs the PUBLIC npm package it names — on a
    // private fork, the public registry in place of the private source. Every Codex add line the
    // page prints carries a ref, as the Codex root README's does.
    const adds = [...read(PLUGINS).matchAll(/^.*codex plugin marketplace add .*$/gm)].map((match) => match[0]);
    expect(adds.length, "the plugins guide prints no Codex marketplace add").toBeGreaterThan(1);
    for (const line of adds) {
      expect(line, "a Codex marketplace add line carries no --ref").toMatch(/ --ref \S/);
    }
  });

  it("the pages that describe signature verification say the client is optional", () => {
    // Left for this unit by the dependency change that made it true. The claim is read off
    // `package.json` rather than typed here, so the day the client moves back to a required
    // dependency this fails as a stale-page report instead of quietly staying green.
    const pkg = JSON.parse(read("package.json")) as {
      optionalDependencies?: Record<string, string>;
      dependencies?: Record<string, string>;
    };
    expect(
      pkg.optionalDependencies?.["sigstore"],
      "sigstore is no longer an optional dependency — these two pages now overstate the risk",
    ).toBeDefined();
    expect(pkg.dependencies?.["sigstore"], "sigstore is declared in both groups").toBeUndefined();

    // Both halves on both pages: that the client is optional since 1.9.0, and that an install
    // without it REFUSES rather than passing. Half of that pair is the dangerous half — a
    // reader told only that the client is optional would reasonably assume verification
    // degrades to a pass.
    for (const page of [PACKS_AND_TRUST, SECURITY_MAPPING]) {
      const text = flowed(read(page));
      expect(text, `${page} never says the Sigstore client is optional since 1.9.0`).toMatch(
        /Since 1\.9\.0 the Sigstore client is an \*{0,2}optional\*{0,2} dependency/,
      );
      expect(text, `${page} never names the --omit=optional install`).toContain("--omit=optional");
      expect(text, `${page} does not call the missing-client outcome a refusal`).toContain(
        "**refuses**",
      );
      expect(text, `${page} never says a missing client refuses rather than passes`).toContain(
        "the claim — never a pass, and never the pin-waivable `unarmed`",
      );
    }
  });

  it("getting started shows the install line and the whole command surface", () => {
    const text = read(GETTING_STARTED);
    expect(text, "the getting-started guide never shows the install command").toContain(
      INSTALL_COMMAND,
    );
    // Hand-maintained, in the order `src/cli.ts` advertises, and it is the DRIVER: a verb joins
    // the surface here first and the page is then obliged to name it, which is what made
    // `workspace` a required word on that page rather than an optional one, and `worktree` after
    // it. The plumbing verbs are deliberately absent — `learn` and `handoff` are not something a
    // reader types.
    for (const command of [
      "init",
      "sync",
      "check",
      "validate",
      "add",
      "config",
      "workspace",
      "worktree",
      // TEST CHANGE, justified: the same verb, in the same CLI position, in the second
      // hand-maintained copy of the surface this file's comment above names.
      "plugin",
      "clean",
    ]) {
      expect(text, `the getting-started guide omits \`${command}\``).toContain(`\`${command}\``);
    }
    expect(text, "the getting-started guide does not say where state lives").toContain(".stamity/");
    // The clients question is a checkbox menu on a TTY, and no page in `docs/` said how to
    // work one — the keys were spelled only in `src/cli/kit/prompts.ts`'s own hint line. A
    // reader who cannot see how to toggle a row cannot answer the first question init asks.
    expect(text, "the getting-started guide never says the clients question is a menu").toContain(
      "checkbox menu",
    );
    for (const key of ["arrow keys", "space toggles", "enter confirms"]) {
      expect(text, `the getting-started guide omits how to work the menu: ${key}`).toContain(key);
    }
  });

  it("tells a Codex reader when to print the resume card by hand", () => {
    // The by-hand `stamity ledger status` advice named Cursor and Copilot only, while Codex
    // prints the card only with its hooks enabled and trusted, and never under `codex exec`
    // (learning codex-hooks-need-the-features-flag-and-exec-runs-none). All three loading
    // steps are named, since a reply naming only the flag is the half-answer that learning
    // records.
    const text = read(GETTING_STARTED).replace(/\s+/g, " ");
    expect(text).toContain("Run it on Codex too when its hooks are not running");
    expect(text).toContain("`[features] hooks = true`");
    expect(text).toContain("the project trusted, and each hook trusted through `/hooks`");
    expect(text).toContain("`codex exec` runs no project hook at all");
  });

  it("names the managed CLAUDE.md block wherever a page enumerates what init writes", () => {
    // The Claude Code entry point is a managed block inside `CLAUDE.md` (this guide's own
    // client table says so, and `docs/capability-matrix.md` declares the cap), so a page that
    // lists what init writes and commits and stops at `AGENTS.md` plus the client trees has
    // left out the one file that carries the import. Three enumerations, one omission each.
    for (const page of [GETTING_STARTED, WORKING_WITH_STAMITY, README]) {
      expect(read(page), `${page} enumerates the committed setup without CLAUDE.md`).toContain(
        "the managed block in `CLAUDE.md`",
      );
    }
  });

  // Additive: nothing above weakens. The charter's `## Touchpoints` index is the one home for a
  // touchpoint's one-line job — in a consumer repository it is an always-on file that cannot
  // link and cannot grow past the ratchet — so the workflow guide's "Its job" column is a mirror
  // of it rather than a second copy, and this is what holds the two equal. It reads the corpus
  // template rather than the emitted `AGENTS.md` so a skipped dogfood sync cannot make a correct
  // guide look wrong. A tenth touchpoint hits the roster assertion first, then the always-on
  // ratchet in `test/corpus/invariants.test.ts`, and only then the order assertion here.
  it("the workflow guide mirrors the charter's touchpoint index, one-liner for one-liner", async () => {
    const charter = charterTouchpoints();
    const rows = new Map<string, string>();
    for (const [, id, cell] of read(WORKING_WITH_STAMITY).matchAll(TOUCHPOINT_ROW)) {
      rows.set(id ?? "", oneLine(cell ?? ""));
    }

    // The vacuity guard: the ids are the catalog's own command roster, so a touchpoint that
    // lands in `content/commands/` and reaches only one of the two surfaces fails here rather
    // than shipping a guide that describes eight of ten.
    const catalog = (await loadCorpusIndex()).items
      .filter((item) => item.type === "command")
      .map((item) => `/${COMMAND_PREFIX}${item.id.slice(COMMAND_ID_PREFIX.length)}`);
    expect(
      [...charter.keys()].toSorted(),
      "the charter's touchpoint index is not the catalog's command roster",
    ).toEqual(catalog.toSorted());

    // Order too: the page narrates the index, so it reads in the index's SDLC order.
    expect(
      [...rows.keys()],
      `${WORKING_WITH_STAMITY} orders its touchpoint table against the charter's index`,
    ).toEqual([...charter.keys()]);

    for (const [id, gloss] of charter) {
      expect(
        rows.get(id),
        `${WORKING_WITH_STAMITY} restates ${id} instead of mirroring the charter's index`,
      ).toBe(oneLine(gloss));
    }
  });

  it("the workflow guide stays within the line budget its plan declares", () => {
    expect(lines(read(WORKING_WITH_STAMITY)).length).toBeLessThanOrEqual(MAX_LINES);
  });

  /**
   * The spine heading and its fence are ONE surface pin, because a stylesheet rule depends on
   * both. `website/src/css/custom.css` reserves the diagram's box before the diagram exists —
   * there is no element to style at first paint, so the box is generated on the heading above
   * it, `.markdown h2#the-spine:has(+ p)::after`, and cancels itself when the rendered
   * container lands between the two. That rule reads two facts of this page that live nowhere
   * else: the heading text, which the site slugs into the selector, and the fence being the
   * heading's immediately next block.
   *
   * Both drift silently, in opposite directions, and the rule's own comment names them: rename
   * the heading and the selector stops matching, reverting the page to the measured 0.26-0.57
   * CLS; put a paragraph directly under the heading and `:has(+ p)` matches forever, leaving a
   * permanent ~767px gap. Neither renders as an error, so nothing else in this tree notices.
   *
   * The slug is DERIVED from the matched heading rather than typed, so renaming the heading and
   * the selector together passes and renaming either alone fails — which is the coupling, not
   * the spelling, being held.
   */
  it("the spine heading and its fence stay pinned to the stylesheet's CLS reservation", () => {
    const spine = /^## (.+)\n\n```mermaid$/m.exec(read(WORKING_WITH_STAMITY));
    expect(
      spine,
      `${WORKING_WITH_STAMITY} no longer opens its mermaid fence directly under a heading — the CLS reservation in website/src/css/custom.css now leaves a permanent gap`,
    ).not.toBeNull();

    const slug = (spine?.[1] ?? "").toLowerCase().replaceAll(/[^a-z0-9]+/g, "-");
    expect(
      read("website/src/css/custom.css"),
      `the CLS reservation does not name the slug of "${spine?.[1]}" — the heading was renamed and the reservation stopped matching`,
    ).toContain(`h2#${slug}:has(+ p)::after`);
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
