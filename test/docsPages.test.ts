import { execFileSync, spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import {
  MEASUREMENTS_DOC_PATH,
  MEASUREMENT_SNAPSHOT_PATH,
  RECORDS_BLOB_URL,
  measurementInputs,
  readRunOfRecord,
} from "../src/cli/docs/measurements.ts";
import { COMMAND_ID_PREFIX } from "../src/content/catalog.ts";
import {
  CLASS_LAYOUT,
  LEAN_LINE_THRESHOLDS,
  SKILL_FILE,
} from "../src/content/userContent.ts";
import { TRUST_TIERS } from "../src/pack/trust.ts";
import { packReinstallSteps } from "../src/pack/verifyInstalled.ts";
import { CONTENT_CLASSES } from "../src/types/content.ts";
import { CLAUDE_HOOKS_DIR, CLIENT_CLOUD_FACTS } from "../src/hooks/model.ts";
import { parseRunContract } from "../src/runs/runContract.ts";
import { CORPUS_ROOT, loadCorpusIndex } from "./corpus/harness.ts";
import { makeCliFixture } from "./support/cliHarness.ts";
import { GATE_RUN_TIMEOUT_MS, leakGateFailureDetail, runLeakGateOnce } from "./support/leakGateRun.ts";
import {
  EVAL_SET,
  RELEASE_CHECKLIST,
  fileSection,
  namedPaths,
  perReleaseLines,
  releaseRuleTexts,
  sectionOf,
  uncovered,
} from "./support/pageSections.ts";
// @ts-expect-error — import-safe native ESM path list with no type declarations, outside the product package.
import { isRecordPath } from "../scripts/records-paths.mjs";
// TEST CHANGE, justified (2026-10-14, plan 020 file 1, unit d4-docs-site, REQ-PLUGIN-029 retired):
// the three distribution imports that stood here (`buildCatalogIdentity`,
// `resolveDistributionIdentity`, `renderClaudeManagedSettings`) fed one case only, the fork guide's
// managed-settings block. That section left the guide with the plugin route, so the case and its
// imports went with it, and nothing here imports from `scripts/plugins/`.
// @ts-expect-error — the manual eval harness is import-safe native ESM, outside the product package.
import { RUNNER_FILES } from "../scripts/eval/run.mjs";
// @ts-expect-error — the CI lane classifier is import-safe native ESM with no type declarations.
import { LANE_PATHS } from "../scripts/ci/records-only.mjs";
// @ts-expect-error — the QA hook-runs instrument is import-safe native ESM with no type declarations.
import { ASK_CLASS_CLIENTS } from "../scripts/qa/hook-runs.mjs";

/**
 * The gate on the fifteen hand-written pages: three at the root, twelve guides
 * under `docs/`.
 *
 * The rest of `docs/` is generated and drift-tested against its renderer; these
 * fifteen are typed by a human, so the only guard is this file.
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
 * Two properties are asserted on all fifteen pages because the hand bucket is
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

/**
 * The run of record and its release, as `evals/run-of-record.json` names them.
 *
 * TEST CHANGE, justified: 2026-10-08, unit c2-run-of-record, review round 1 (M-1). These were
 * imported as module constants the generator read when it loaded; it now reads the file only when
 * a reader needs it, so a malformed file no longer breaks every importer. The suite reads it here
 * under the same names, and every case holds the pages to the same values.
 */
const { path: RUN_OF_RECORD_PATH, release: RUN_OF_RECORD_RELEASE } = readRunOfRecord(REPO_ROOT);

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
// FIFTH there, and the workspaces guide last here and SIXTH there.
//
// Four corrections this comment has already needed, kept as the warning they are. The ordinals
// are indices into a literal array, so inserting one entry moves every entry after it —
// DOCTRINE at position 3 moved these two once, PLUGINS at position 3 moved them again, and
// PLUGINS leaving with the plugin route (plan 020 file 1, 1.15.0) moved them back by one.
// And the array is NOT the sidebar's sequence, which this comment used to claim: the sidebar
// follows it except for MIGRATION, which is FOURTH here and deliberately unlisted there
// (`website/sidebars.ts`; MAPPED_GUIDES below carries the same decision for the README map).
const CUSTOMIZATION = "docs/customization.md";
const DOCTRINE = "docs/doctrine.md";
const ENTERPRISE_FORKS = "docs/enterprise-forks.md";
const ENTERPRISE_QUICKSTART = "docs/enterprise-quickstart.md";
const GETTING_STARTED = "docs/getting-started.md";
const MIGRATION = "docs/migration.md";
const PACKS_AND_TRUST = "docs/packs-and-trust.md";
const SECURITY_MAPPING = "docs/security-mapping.md";
const TROUBLESHOOTING = "docs/troubleshooting.md";
const WORKING_WITH_STAMITY = "docs/working-with-stamity.md";
const WORKSPACES = "docs/workspaces.md";
// Declared apart from the path-order block above, so the ordinals its comment names stay true.
const CLOUD = "docs/cloud.md";

/**
 * The twelve hand-written guides under `docs/`.
 *
 * Everything else in that directory is rendered from code and carries a
 * "GENERATED FILE, rewrite it with X" header; these twelve are the only pages
 * there a human types, which is exactly the line the hand bucket is drawn on.
 *
 * `docs/specs/` is outside the bucket and outside the site: five engineering
 * design documents, excluded from the build by `website/docusaurus.config.ts`
 * and from the roster by `test/ci/docsRoster.test.ts`. They are not published
 * pages, so the published-page contract does not apply to them.
 */
// TEST CHANGE, justified (2026-10-14, plan 020 file 1, unit d4-docs-site, REQ-PLUGIN-030 retired):
// PLUGINS, third here since the plugin route shipped, left with that route; `docs/plugins.md` is
// deleted, so the bucket is eleven guides and fourteen pages. Every other entry keeps its order.
const GUIDES: readonly string[] = [
  GETTING_STARTED,
  WORKING_WITH_STAMITY,
  DOCTRINE,
  MIGRATION,
  CUSTOMIZATION,
  WORKSPACES,
  // Seventh, directly before the fork guide it routes into, as the sidebar and the README map put
  // it. Inserted after WORKSPACES on purpose: the ordinals the comment above the path constants
  // names (the customization guide FIFTH, the workspaces guide SIXTH) sit before it and do not
  // move.
  ENTERPRISE_QUICKSTART,
  ENTERPRISE_FORKS,
  PACKS_AND_TRUST,
  TROUBLESHOOTING,
  // Appended rather than filed beside the security-adjacent guides on purpose: the ordinals in
  // the comment above index into this literal, so an insertion in the middle moves every entry
  // after it and the note goes stale the same day.
  SECURITY_MAPPING,
  // ADDED 2026-10-18 (plan 021 file 2, unit v15-cloud-page, REQ-PROVE-043): the cloud guide joins
  // the bucket, so it is twelve guides and fifteen pages. Appended for the same reason as the entry
  // above; the sidebar, README's map and `llms.txt` list it last of the mapped guides too.
  CLOUD,
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
 *
 * TEST CHANGE, justified: MOVED 2026-09-30, from 2026-09-22, by the client currency pass (plan 013,
 * sw14-client-currency-sweep). The Codex learning this page's hook paragraph rests on was re-run on
 * codex-cli 0.155.1 that day and failed as stated, so the paragraph now carries that result (the
 * default measured on, the project-file key not shown to be read, `codex exec` running none with
 * the cause not isolated) beside the 0.154.0 history the literals below still pin. A page carrying
 * a 2026-09-30 claim can honestly carry only that date, which the 2026-09-22 pin refused as later
 * than the pass it ships in. The header says the re-attestation covers that paragraph alone.
 */
const EVIDENCE_REATTESTATION_DATE = "2026-09-30";

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
 *
 * TEST CHANGE, justified: 158 to 159, the cost of ONE more map row, on the same reasoning a
 * fourth time. `docs/enterprise-quickstart.md` is a new hand page (plan 010, unit
 * docs-quickstart), so the map owes it a row. The `llms.txt` row's guide count moved from eleven
 * to twelve IN PLACE and paid for nothing. So the budget moves by exactly the row.
 *
 * TEST CHANGE, justified: 159 to 160, the cost of ONE more map row, on the same reasoning a fifth
 * time. `docs/cloud.md` is a new hand page (plan 021 file 2, unit v15-cloud-page), so the map owes
 * it a row. The `llms.txt` row's guide count moved from eleven to twelve IN PLACE and paid for
 * nothing. So the budget moves by exactly the row.
 *
 * TEST CHANGE, justified: 160 to 165, the cost of two corrections the 1.16.0 cut's re-attestation
 * found (run 2026-10-18_cloud-runs-2, ledger review/210 and review/211), on the reasoning of the
 * first move above. The git-and-network paragraph now names `plan` and `run` among the verbs that
 * need git, the unattended pre-flight and the run verbs among the places the engine reaches the
 * network, and `/st-work`'s close walk among the GitHub writes: three lines. The hook-script
 * paragraph now names four portable bodies, Claude Code's three adapter scripts and its copies
 * under `.claude/hooks/stamity/`, and Cursor's five: two lines. Both paragraphs were rewrapped
 * inside themselves and the plumbing-verb sentence moved in place, so the budget moves by exactly
 * those five lines.
 */
const README_MAX_LINES = 165;

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
// TEST CHANGE, justified: MOVED 2026-10-20, from "2026-10-15" (the 1.15.0 cut) to the 1.16.0 cut.
// Five read-only reviewers re-read every hand page claim by claim against the 1.16.0 candidate
// 035f078d (run 2026-10-18_cloud-runs-2, units c4a to c4e, ledger review/209 to review/236 and
// review/238 to review/242), every row was applied against the tree, and the whole bucket,
// GOVERNANCE.md with it, was restamped onto the cut form — the three pages plan 021 file 2 had
// moved onto the commit form on 2026-10-18 (README.md, docs/cloud.md and the doctrine) included,
// since the cut re-read them with everything else. The claims that moved at the cut itself:
// troubleshooting's sample `check` transcript is a real 1.16.0 run of this lane's build, whose
// provenance line reads "generated by 1.16.0" and whose manifest row counts 82 managed paths; and
// SECURITY.md's open alerts were read live on 2026-10-20 and still name two advisories in three
// alerts, none with a patched version. README's run of record and merge-ready figure are not moved
// here.
//
// MOVED 2026-10-15, from "2026-10-12" (the 1.14.0 cut) to the 1.15.0 cut.
// Four read-only reviewers re-read every hand page claim by claim against the 1.15.0 candidate
// 4e892337 (run 2026-10-14_cli-native, ledger reattest/1 to reattest/21), every row was applied or
// answered against the tree, and the whole bucket, GOVERNANCE.md with it, was restamped onto the
// cut form — the seven pages the between-cuts passes of 2026-10-13 and 2026-10-14 had moved onto
// the commit form (README.md, SECURITY.md, CONTRIBUTING.md, GOVERNANCE.md, the doctrine and both
// enterprise guides) included, and the getting-started guide's 2026-10-14 note on the removed APM
// and plugin routes, which said that section is re-read at the next cut, retired with it, since
// the cut re-read them with everything else. The claims that moved at the cut itself:
// troubleshooting's sample `check` transcript is a real 1.15.0 run, whose provenance line reads
// "generated by 1.15.0" and whose manifest row counts 67 managed paths; SECURITY.md's open alerts
// were read live on 2026-10-15 and still name two advisories in three alerts, none with a patched
// version; `check`'s git-available row and the troubleshooting row that quotes it say /st-work and
// /st-quick stop at a folder git was not started in; and the upgrade note on the charter case there
// names 1.15.0, whose invariants moved to 1.3.0. README's run of record and merge-ready figure are
// not moved here.
//
// MOVED 2026-10-12, from "2026-10-08" (the 1.12.0 cut) to the 1.14.0 cut;
// no release carries 1.13.0, so this is the cut after 1.12.0.
// Four read-only attestors re-read every hand page claim by claim against the 1.14.0 candidate
// (run 2026-10-11_release-1-14-0, ledger reattest/1 to reattest/24), every row was applied or
// answered against the tree, and the whole bucket, GOVERNANCE.md with it, was restamped onto the
// cut form — the four pages run 2026-10-08_maintainer-tooling had moved onto the commit form on
// 2026-10-08 (CONTRIBUTING.md, plugins, troubleshooting and migration) included, since the cut
// re-read them with everything else. The claims that moved at the cut itself: README's merge-ready
// figure and link now name the snapshot this cut froze
// (`evals/measurements/merge-ready-2026-10-12.json`, 7 of 17) and its run of record is run 45, the
// 1.14.0 release run; troubleshooting's sample `check` transcript is a real 1.14.0 run, whose
// provenance line reads "generated by 1.14.0" and whose invariants row prints 1.2.0; the fork
// guide's tag example and managed-settings refs name 1.14.0; and SECURITY.md names the two
// advisories open at the cut, in three alerts, each with no patched version.
//
// MOVED 2026-10-08, from "2026-10-01" (the 1.11.0 cut) to the 1.12.0 cut.
// Four read-only attestors re-read every hand page claim by claim against the 1.12.0 candidate
// (run 2026-10-07_release-1-12-0, ledger reattest/1 to reattest/32), every row was applied or
// adjusted against the tree, and the whole bucket, GOVERNANCE.md with it, was restamped onto the
// cut form — the three pages plan 016 file 0 had moved onto the commit form on 2026-10-07
// (plugins, troubleshooting and migration) included, since the cut re-read them with everything
// else. The claims that moved at the cut itself: README's merge-ready figure and link now name the
// snapshot this cut froze (`evals/measurements/merge-ready-2026-10-08.json`, 7 of 14);
// troubleshooting's sample `check` transcript is a real 1.12.0 run, whose provenance line reads
// "generated by 1.12.0"; the fork guide's tag example and managed-settings refs name 1.12.0; and
// SECURITY.md states the open http-cache-semantics advisory instead of "no accepted risk remains".
//
// MOVED 2026-10-01, from "2026-09-28" (the 1.10.0 cut) to the 1.11.0 cut.
// Every page of the bucket was re-attested against the 1.11.0 candidate on the night of the cut,
// and the whole bucket, GOVERNANCE.md with it, was restamped onto the cut form — the five pages
// the 2026-09-30 passes had moved onto the commit form (SECURITY.md, customization, getting
// started, plugins and troubleshooting) included, since the cut re-read them with everything else.
// The claims that moved at the cut itself: README's merge-ready figure, run count and link now
// name the snapshot this cut froze (`evals/measurements/merge-ready-2026-10-01.json`, 6 of 10);
// troubleshooting's sample `check` transcript is a real 1.11.0 run, whose provenance line reads
// "generated by 1.11.0"; and SECURITY.md states the 2026-09-15 Codex hook measurement in the
// troubleshooting page's words.
//
// MOVED 2026-09-28, from "2026-09-23" (the 1.9.1 cut) to the 1.10.0 cut.
// Read-only attestors at the stronger class re-read the bucket claim by claim against the 1.10.0
// candidate: fourteen pages on 2026-09-27, and README and the doctrine on 2026-09-28 once the run
// of record had merged. Every finding was fixed or ledgered, and the whole bucket, GOVERNANCE.md
// with it, was restamped onto the cut form. The claims that moved at the cut itself: README's
// merge-ready figure, run count and link now name the snapshot this cut froze
// (`evals/measurements/merge-ready-2026-09-28.json`); the doctrine's 1.0.0 row is dated at the
// charter's ratification, 2026-08-31, and says versioning began 2026-09-15; and troubleshooting's
// sample `check` transcript is a real 1.10.0 run, printing invariants 1.1.0.
//
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
const RELEASE_CUT_DATE = "2026-10-20";

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
 *
 * TEST CHANGE, justified: MOVED 2026-09-28, from 2026-09-26, to the 1.10.0 cut date. The cut
 * restamped all fifteen pages onto the cut form, so the commit form has no members and the
 * assertion's else branch requires this constant to equal RELEASE_CUT_DATE. The re-attestation
 * itself ran on two days, 2026-09-27 for fourteen pages and 2026-09-28 for README and the
 * doctrine; neither date is carried as a commit-form clause, because every page now says it was
 * verified at the cut, and the cut is the later of the two passes.
 *
 * NOT MOVED, 2026-09-28, after the 1.10.0 cut: the commit form has one member again. Capturing two
 * learnings moved the learnings count in `docs/troubleshooting.md`'s sample `check` transcript
 * from 14 to 16, so that page carries the commit form naming the learnings commit the real `check`
 * ran on plus `Re-attested 2026-09-28` — the same day as the cut, so this constant already names
 * the pass and the assertion's first branch now reads it.
 *
 * TEST CHANGE, justified: MOVED 2026-09-30, from 2026-09-28, by Package 17's learnings pass.
 * Retiring four learnings and capturing two moved the learnings count in
 * `docs/troubleshooting.md`'s sample `check` transcript from 16 to 14, re-read against a real
 * `node dist/cli.js check` run. That page keeps the commit form, now naming the base commit the
 * learnings commit was built on (b28d6a6b, since a commit cannot name its own sha) plus
 * `Re-attested 2026-09-30`. A page re-read today can honestly carry only today's date, which the
 * 2026-09-28 pin refused as later than the pass it ships in. Every other page keeps its cut date.
 *
 * NOT MOVED, 2026-09-30, by the client currency pass (plan 013, sw14-client-currency-sweep), which
 * ran on the constant's own date. It moved dated claims on four more hand pages —
 * `docs/customization.md`, `docs/getting-started.md`, `SECURITY.md` and `docs/plugins.md` — so
 * each left the cut form for the commit form naming the cut's re-attestation commit (bb565dfa) plus
 * `Re-attested 2026-09-30` for the claims it moved, the same shape the 2026-09-22 Copilot pass
 * gave `docs/plugins.md`. The same pass moved `docs/troubleshooting.md`'s header from the base
 * commit to the integrated learnings commit cb215fb3, whose own `check` prints the 14 learnings
 * the sample transcript shows (the 16-learning tree at b28d6a6b did not).
 *
 * TEST CHANGE, justified: MOVED 2026-10-01, from 2026-09-30, to the 1.11.0 cut date. The cut
 * re-attested every page and restamped all fifteen onto the cut form, the five commit-form pages
 * of 2026-09-30 among them, so the commit form has no members and the assertion's else branch
 * requires this constant to equal RELEASE_CUT_DATE. Their `Re-attested 2026-09-30` clauses are
 * not carried: each page now says it was verified at the cut, and the cut is the later pass.
 *
 * TEST CHANGE, justified: MOVED 2026-10-07, from 2026-10-01, by plan 016 file 0's
 * u0-settings-ownership pass (REQ-FLOW-036). `.claude/settings.json` is now owned entry by entry
 * and `--force` no longer replaces it, so `docs/plugins.md`, `docs/troubleshooting.md` and
 * `docs/migration.md` were re-read for that claim against the lane base 239eb3a9 and moved onto
 * the commit form with `Re-attested 2026-10-07`. A page re-read today can honestly carry only
 * today's date, which the 2026-10-01 pin refused as later than the pass it ships in. Every other
 * page keeps its cut date.
 *
 * TEST CHANGE, justified: MOVED 2026-10-08, from 2026-10-07, to the 1.12.0 cut date. The cut
 * re-attested every page and restamped all fifteen onto the cut form, the three commit-form pages
 * of 2026-10-07 among them, so the commit form has no members and the assertion's else branch
 * requires this constant to equal RELEASE_CUT_DATE. Their `Re-attested 2026-10-07` clauses are
 * not carried: each page now says it was verified at the cut, and the cut is the later pass.
 *
 * NOT MOVED, 2026-10-08, after the 1.12.0 cut: the commit form has five members again, all
 * re-read on the constant's own date in run 2026-10-08_maintainer-tooling, so the constant already
 * names the pass and the assertion's first branch now reads it. `docs/plugins.md`,
 * `docs/troubleshooting.md` and `docs/migration.md` name the lane base 0ee31417 plus `Re-attested
 * 2026-10-08 for the Claude allow rows` (the emitted Claude settings pre-approve no tool).
 * `CONTRIBUTING.md` and `GOVERNANCE.md` name the integration head 038282a2 plus `Re-attested
 * 2026-10-08 for the CI lanes and the proven push`: their `all-ci-checks` passages were re-read
 * against `.github/workflows/ci.yml` and `scripts/ci/records-only.mjs`, which now skip the matrix
 * on a push whose tree `ci.yml`'s own pull-request run passed and give specs, learnings and
 * website changes a lane beside the records lane.
 *
 * TEST CHANGE, justified: MOVED 2026-10-12, from 2026-10-08, to the 1.14.0 cut date. The cut
 * re-attested every page and restamped all fifteen onto the cut form, the four commit-form pages
 * of 2026-10-08 among them (GOVERNANCE.md, the fifth, sits outside the bucket and was restamped
 * with it), so the commit form has no members and the assertion's else branch requires this
 * constant to equal RELEASE_CUT_DATE. Their `Re-attested 2026-10-08` clauses are not carried: each
 * page now says it was verified at the cut, and the cut is the later pass.
 *
 * TEST CHANGE, justified: MOVED 2026-10-13, from 2026-10-12, by plan 014 file 1, unit
 * f1-import-recipe (REQ-UPSTREAM-014). The private import in `docs/enterprise-forks.md` now copies
 * upstream `main` alone, so that page was re-read for the recipe and the mirror-era sentences it
 * qualifies and moved onto the commit form naming the 1.14.0 cut c3d81529 plus `Re-attested
 * 2026-10-13`; `CONTRIBUTING.md` joins it in the same pull request (unit
 * f4-retire-superseded-eval-inputs). A page re-read today can honestly carry only today's date,
 * which the 2026-10-12 pin refused as later than the pass it ships in. Every other page keeps its
 * cut date.
 *
 * TEST CHANGE, justified: MOVED 2026-10-14, from 2026-10-13, by plan 014 file 2, unit
 * r3-hand-page-links (REQ-PROVE-020, REQ-UPSTREAM-007). The run records and the eval evidence moved
 * to the `records` branch, so `README.md`, `docs/doctrine.md`, `docs/enterprise-forks.md`,
 * `docs/plugins.md` and `SECURITY.md` were re-read for every link and path into a record, which now
 * links into or names the `records` branch, and the fork guide's `generatedPaths` example for the
 * measurements page it no longer lists. Each moved onto the commit form naming the 1.14.0 cut
 * c3d81529 plus `Re-attested 2026-10-14`, the fork guide from its 2026-10-13 clause. A page re-read
 * today can honestly carry only today's date, which the 2026-10-13 pin refused as later than the
 * pass it ships in. `CONTRIBUTING.md` keeps its 2026-10-13 clause and every other page its cut date.
 *
 * NOT MOVED, 2026-10-14, by the same run's integration fix round (ledger review/16, review/19,
 * review/20), which ran on the constant's own date. `CONTRIBUTING.md` was re-read for the record set
 * its lanes paragraph names (plans, evidence and the eval records now among them) and moved its
 * clause to `Re-attested 2026-10-14`; `GOVERNANCE.md`, outside the bucket, moved onto the commit
 * form for the same paragraph; `SECURITY.md` was re-read for its controls table's inbox rows and run
 * ledgers, and `README.md` for its merge-ready figure, both already on today's clause.
 *
 * TEST CHANGE, justified: MOVED 2026-10-15, from 2026-10-14, to the 1.15.0 cut date. The cut
 * re-attested every page and restamped all fourteen onto the cut form, the six commit-form pages
 * of 2026-10-14 among them (GOVERNANCE.md, the seventh, sits outside the bucket and was restamped
 * with them), so the commit form has no members and the assertion's else branch requires this
 * constant to equal RELEASE_CUT_DATE. Their `Re-attested 2026-10-14` clauses are not carried: each
 * page now says it was verified at the cut, and the cut is the later pass.
 *
 * TEST CHANGE, justified: MOVED 2026-10-18, from 2026-10-15, by plan 021 file 2, unit
 * v15-cloud-page (REQ-PROVE-043). `docs/cloud.md` is a new hand page, and the only honest date a
 * page written today can carry is today's, which the 2026-10-15 pin refused as later than the pass
 * it ships in. The pages the new guide moved were re-read for those claims and moved onto the commit
 * form naming the lane base 1fd1808d plus `Re-attested 2026-10-18`: `README.md` (its map row and the
 * `llms.txt` row's guide count) and `docs/doctrine.md` (the bucket's two count words). Every other
 * page keeps its cut date.
 *
 * TEST CHANGE, justified: MOVED 2026-10-20, from 2026-10-18, to the 1.16.0 cut date. The cut
 * re-attested every page and restamped all fifteen onto the cut form, the three commit-form pages
 * of 2026-10-18 among them (README.md, docs/cloud.md and docs/doctrine.md; GOVERNANCE.md sits
 * outside the bucket and was restamped with them), so the commit form has no members and the
 * assertion's else branch requires this constant to equal RELEASE_CUT_DATE. Their
 * `Re-attested 2026-10-18` clauses are not carried: each page now says it was verified at the cut,
 * and the cut is the later pass.
 *
 * TEST CHANGE, justified: MOVED 2026-10-23, from 2026-10-20, by plan 022 file 1, unit
 * a11-release-workflows (REQ-PLUGIN-031, REQ-PLUGIN-050). `docs/enterprise-forks.md`'s "Tag a
 * release" section now says the gates job dry-runs the publish and the publish names the `latest`
 * dist-tag, and the page moved onto the commit form naming the lane base f9abc9c6 plus
 * `Re-attested 2026-10-23`. The newest commit-form date is that pass, so the constant names it;
 * every other page keeps its cut date.
 *
 * TEST CHANGE, justified: MOVED 2026-10-25, from 2026-10-23, by plan 022 file 1, unit
 * a16-security-pages (REQ-FLOW-145; REQ-FLOW-036, REQ-FLOW-102 and REQ-FLOW-104 as built). `SECURITY.md`,
 * `docs/security-mapping.md`, `docs/cloud.md`, `docs/troubleshooting.md` and `docs/working-with-stamity.md`
 * were re-read against the integration head for the autonomy setting, the land verb and the rows the
 * file's units moved, and moved onto the commit form naming that head, 89e088f9, plus `Re-attested
 * 2026-10-25`. A page re-read today can honestly carry only today's date, which the 2026-10-23 pin
 * refused as later than the pass it ships in. `docs/enterprise-forks.md` keeps its 2026-10-23 clause and
 * every other page its cut date.
 */
const REATTESTATION_DATE = "2026-10-25";

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

// `sectionOf`, one heading's section of a page, lives in `test/support/pageSections.ts` with the
// release-rule readers (ledger build/10), so this file and the records suite read one copy.

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
 * `content/skills/` holds 7 skills across 19 markdown files, and a raw file
 * count would state 19. The charter is the one piece of corpus content the
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
  // twelve" when the enterprise-forks guide did, "all fifteen" when the enterprise quickstart did,
  // "all fourteen" when the plugins guide left with the plugin route (plan 020 file 1), and "all
  // fifteen" again when the cloud guide joined (plan 021 file 2, unit v15-cloud-page):
  // the name states the membership count, and the loop below is unchanged through all of them and
  // still runs over every member.
  it("all fifteen exist and carry real content", () => {
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
      // TEST CHANGE 2026-10-08, justified — the cost moved, not the criterion: the gate is read
      // through the shared per-process run that `test/ci/leakGate.test.ts` also reads, and the
      // detail asserted empty is the same exit status and streams this case printed before.
      expect(leakGateFailureDetail(runLeakGateOnce())).toBe("");
    },
    // Bounded by the whole-repository gate run it may spawn, not by the suite-wide 20s default
    // in `vitest.config.ts`; the derivation lives beside the constant in `test/support/leakGateRun.ts`.
    GATE_RUN_TIMEOUT_MS,
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
    // The honest gap, kept as history: the 2026-09-15 measurement never ran without the key, so
    // it measured no default. The 2026-09-30 re-run on 0.155.1 did, and the page states that
    // default beside the hooks page's own line; this pin keeps the older run from being read as
    // covering it.
    expect(text, "the page no longer dates the 2026-09-15 run to the emitted key").toMatch(
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
  // TEST CHANGE, justified (2026-10-14, plan 020 file 1, unit d4-docs-site, REQ-PLUGIN-047): the
  // `plugin` verb leaves the advertised surface with the plugin route (unit d6-verb removes it from
  // `src/cli.ts`), so README names nine verbs and this array drops it from its CLI position between
  // `worktree` and `clean`. The order and length assertions below are unchanged.
  // TEST CHANGE, justified (plan 022 file 2, unit b9-upgrade-verb, REQ-FLOW-034): `upgrade` joins
  // the advertised surface after `sync` (`src/cli.ts`), so README names ten verbs and this array
  // gains it in that CLI position. The order and length assertions keep their shape.
  it("states the command surface — ten verbs plus the plumbing verbs", () => {
    const text = read(README);
    const ADVERTISED = [
      "init",
      "sync",
      "upgrade",
      "check",
      "validate",
      "add",
      "config",
      "workspace",
      "worktree",
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
    // TEST CHANGE, justified (2026-10-09, run 2026-10-08_product-core, `build/9`): `gate` is the
    // fourth plumbing verb README names behind the advertised surface, and nothing pinned it, so a
    // README dropping it stayed green. This mirrors the three pins above.
    expect(text).toContain("`gate`");
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
    //
    // TEST CHANGE, justified (2026-10-14, unit r3-hand-page-links, REQ-PROVE-020): a target inside
    // this repository's own GitHub home (`ALLOWED_URL`) is skipped, as the hand-page check above
    // skips it. README's three proof links — the merge-ready snapshot, the run of record and the
    // reach snapshot — now point into the `records` branch, which a checkout of `main` does not
    // carry, so their existence is the records branch's and not this tree's. Every repo-relative
    // target is still resolved, and the floor below still counts the map's targets.
    const checked: string[] = [];
    for (const target of linkTargets(read(README))) {
      if (target.startsWith("#") || ALLOWED_URL.test(target)) continue;
      checked.push(target);
      expect(existsSync(join(REPO_ROOT, target)), `README links missing ${target}`).toBe(true);
    }
    expect(checked.length, "README stopped linking anything").toBeGreaterThanOrEqual(
      README_LINK_TARGETS.length,
    );
  });

  // ADDED 2026-10-14 (ledger review/20): README's merge-ready figure is the one the measurements
  // page renders, from the snapshot that page pins, since README says the page "shows the working".
  // README stated 7 of 17 (0.412) from the 2026-10-12 snapshot while the page rendered 7 of 19
  // (0.368) from the 2026-10-13 one, and nothing compared them. Both pages are on `main`; the
  // page is held to its snapshot by the measurements drift check, so this holds README to the page.
  it("states the merge-ready figure the measurements page renders, from the snapshot it pins", () => {
    const readme = collapsed(read(README));
    const stated = /\*\*Merge-ready rate: (\d+) of (\d+) runs, (\d\.\d+)\.\*\*/.exec(readme);
    const rendered = /\*\*(\d+) of (\d+) runs\*\* \((\d\.\d+)\)/.exec(collapsed(read(MEASUREMENTS_DOC_PATH)));
    expect(stated, "README states no merge-ready figure").not.toBeNull();
    expect(rendered, `${MEASUREMENTS_DOC_PATH} renders no merge-ready figure`).not.toBeNull();
    expect(stated?.slice(1), `README's merge-ready figure is not the one ${MEASUREMENTS_DOC_PATH} renders`).toEqual(
      rendered?.slice(1),
    );
    expect(readme, "README does not link the snapshot the measurements page pins").toContain(
      `(${RECORDS_BLOB_URL}${MEASUREMENT_SNAPSHOT_PATH})`,
    );
  });
});

/**
 * ADDED 2026-10-14 (ledger review/18, REQ-PROVE-020): README, the doctrine and the fork guide link
 * no record by a repo-relative path. The records live on the `records` branch, so a page on `main`
 * links one as `RECORDS_BLOB_URL` plus its path. The hand-page existence check above refuses a
 * relative record link only in a checkout without the records; after `records.mjs setup` they sit on
 * disk, so it would pass on a maintainer's machine and fail only in CI. This reads the records set
 * from `scripts/records-paths.mjs` (`isRecord`, below) and refuses any relative target inside it,
 * on or off disk.
 */
const RECORD_LINK_PAGES: readonly string[] = [README, DOCTRINE, ENTERPRISE_FORKS];

/** The repo-relative link targets on `page` (its text `text`) that resolve into the records set. */
const relativeRecordTargets = (page: string, text: string): string[] =>
  linkTargets(text).filter((target) => {
    if (target.startsWith("#") || /^[a-z][a-z0-9+.-]*:/i.test(target)) return false;
    const path = relative(REPO_ROOT, resolveTarget(page, target.replace(/[#?].*$/, "")))
      .split(sep)
      .join("/")
      .replace(/\/+$/, "");
    return isRecord(path);
  });

describe("record links on the pages that cite records", () => {
  it("reads a relative link into a record as one, from the linking page's folder", () => {
    expect(
      relativeRecordTargets(DOCTRINE, "[a](../evals/runs/x/RESULTS.md) [b](../docs/plans/) [c](measurements.md)"),
    ).toEqual(["../evals/runs/x/RESULTS.md", "../docs/plans/"]);
    expect(relativeRecordTargets(README, `[a](${RECORDS_BLOB_URL}docs/plans/x.md) [b](evals/SET-v7.md)`)).toEqual([]);
  });

  it.each(RECORD_LINK_PAGES)("%s links no record by a repo-relative path", (page) => {
    expect(
      relativeRecordTargets(page, read(page)),
      `${page} links a record repo-relatively; link it as RECORDS_BLOB_URL plus its path`,
    ).toEqual([]);
  });
});

/**
 * The eval run of record as README and the doctrine type it: `[run N](…), the X release run`.
 * The measurements page renders the same claim from `src/cli/docs/measurements.ts`; these two
 * pages type it by hand, so they are held here to the generator's constants. Read off
 * whitespace-collapsed text, because the pages break the claim at different words.
 */
const RUN_OF_RECORD_PAGES: readonly string[] = [README, DOCTRINE];

/** The `records` branch prefix as a `RegExp` source: every metacharacter escaped. */
const RECORDS_BLOB_PREFIX = RECORDS_BLOB_URL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// TEST CHANGE, justified (2026-10-14, unit r3-hand-page-links, REQ-PROVE-020): the link before the
// run's path also admits the `records` branch prefix (`RECORDS_BLOB_URL`), the form both pages now
// link the run of record in, since the eval runs left `main`. Capture 2 is still the repo-relative
// `evals/runs/…` path, so it is compared with the run of record's path exactly as before.
const RUN_OF_RECORD_CLAIM = new RegExp(
  String.raw`\[run (\d+)\]\((?:\.\.\/|${RECORDS_BLOB_PREFIX})?(evals\/runs\/[^)\s]+)\),? the (\d+\.\d+\.\d+) release run`,
);

const collapsed = (text: string): string => text.replace(/\s+/g, " ");

/**
 * The retired carried-to clause in any wording, and a "carried forward from run N" without the
 * rule's own suffix, refused on the run-of-record pages (REQ-PROVE-020, REQ-PROVE-033). The one
 * carried form admitted is "carried forward from run N: no model-facing change"; `(?!\d|…)` keeps
 * the run number whole, so "run 43" cannot backtrack to "run 4" and slip past the lookahead.
 */
const CARRIED_TO_REFUSAL =
  /carried (?:forward |over )?to \d+\.\d+\.\d+|carried forward from run \d+(?!\d|: no model-facing change)/;

// TEST CHANGE, justified: 2026-10-01, the 1.11.0 cut (review M-1). A local `priorCompleteRun` stood
// here and matched "prior complete run is `…`" anywhere in RESULTS.md, while the measurements chain
// walk read it only inside `## 0. Composition` — so a full run whose text named a prior run in
// another section would have read as composed here and full there. Both now use the parser the
// generator exports and branches on, scoped to that section; it returns null for a full run where
// the local helper returned "".

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

  // ADDED at the 1.10.0 cut, which runs the set and retires the carried clause the 1.9.1 cut
  // typed on both pages: the generator carries its run to no later release, so neither page may.
  //
  // TEST CHANGE, justified: 2026-10-08 (unit c3-release-rules). The refusal's pattern moved, byte
  // for byte, into CARRIED_TO_REFUSAL so the case below can run fixture strings through the same
  // pattern this case applies; nothing it refuses or admits moved.
  it.each(RUN_OF_RECORD_PAGES)("%s carries the run of record to no later release", (page) => {
    expect(collapsed(read(page)), `${page} still carries the run to a later release`).not.toMatch(
      CARRIED_TO_REFUSAL,
    );
  });

  // ADDED 2026-10-08 (REQ-PROVE-020's amendment, unit c3-release-rules): a release the change-aware
  // rule carries forward says "carried forward from run N: no model-facing change", the one carried
  // form re-admitted; the retired "release run, carried to X.Y.Z" still fails.
  //
  // TEST CHANGE, justified: 2026-10-08 (review/27). The refusal admitted every carried wording but
  // "carried to", so "carried forward to 1.14.0" and a bare "carried forward from run 43" passed it.
  // It now refuses the carried-to family and the suffix-less form, one fixture per shape.
  it("admits the carried-forward form and still refuses the carried-to clause", () => {
    expect("carried forward from run 43: no model-facing change").not.toMatch(CARRIED_TO_REFUSAL);
    for (const refused of [
      "[run 43](evals/runs/x/RESULTS.md), the 1.12.0 release run, carried to 1.12.1",
      "release run, carried to 1.12.1",
      "the 1.12.0 release run, carried forward to 1.14.0",
      "the 1.12.0 release run, carried over to 1.14.0",
      "carried forward from run 43",
      "carried forward from run 43 (no model-facing change)",
    ]) {
      expect(refused, `the refusal admits "${refused}"`).toMatch(CARRIED_TO_REFUSAL);
    }
  });

  // MOVED 2026-10-14 (unit r3-hand-page-links, REQ-PROVE-025): "%s discloses a FAIL baseline behind
  // the composed run of record" and "requires a disclosure to name a metric the prior run missed with
  // no listed case" run in `test/records/docsPages.test.ts`, with the pattern they share. The first
  // reads the run of record's results file and its prior run's, which are records on the `records`
  // branch; the second now reads a synthetic § 5 and moved with the pattern it holds, so the pattern
  // has one copy. "tells a full run's results from a composed run's by the prior-run line" is
  // DELETED: it read two real exports to prove what `test/cli/docs/measurements.test.ts` "is read off
  // the composition section alone, and a broken section throws" proves on synthetic exports of the
  // same shapes (`priorCompleteRun` reads a full run as null and a composed run's prior id).
});

// ADDED 2026-10-08 (unit c3-release-rules). REQ-PROVE-033: a release runs the eval set when a
// model-facing input moved and carries the run of record forward otherwise, and the trigger list is
// stated in two places a person reads — the release checklist's eval line and SET-v7's incremental
// section. Each trigger is its own case and reads both texts, so a trigger dropped from either one
// fails by name. REQ-PROVE-034: every per-release line of the checklist names the trigger it runs on.
// The checklist and SET-v7 are read through `test/support/pageSections.ts` (`RELEASE_CHECKLIST`,
// `EVAL_SET`, `fileSection`, `perReleaseLines`, `releaseRuleTexts`), the one copy this file and the
// records suite share (ledger build/10).

// TEST CHANGE, justified: 2026-10-08 (review/25, review/29). The `scripts/eval/**` row reads it
// inside "the eval scripts (…)" now that the eval scripts name two entry points beside it; three
// rows join: the case sets, the eval skill and a FAIL run of record.
const RELEASE_TRIGGERS: ReadonlyArray<readonly [string, readonly RegExp[]]> = [
  ["`content/**`", [/`content\/\*\*`/]],
  ["the emitted client files", [/the emitted client files \(the cross-client goldens\)/]],
  [
    "the eval set's files",
    [/the eval set's files \(`evals\/SET-v7\.md`/, /the selected rubric/, /the model profiles/],
  ],
  ["the case sets old and new (review/25)", [/the case sets old and new \(`evals\/cases-v6\/\*\*`/]],
  ["the eval skill and its copies (review/25)", [/the eval skill and its copies \(/]],
  ["the eval harness `scripts/eval/**` (inbox row 576)", [/the eval scripts \(`scripts\/eval\/\*\*`/]],
  ["the scenario model and the judge model", [/the scenario model(?:,| or| and) the judge model/]],
  ["the pinned client version (inbox row 275)", [/the harness, which carries the pinned client version/]],
  [
    "a FAIL run of record (review/29)",
    [/the run of record is FAIL/, /A FAIL run of record is never carried forward; the release runs the full set\./],
  ],
  [
    "the periodic rule",
    [/the third release since the last full run/, /30 days after the last full run/, /whichever comes first/],
  ],
];

// ADDED 2026-10-08 (review/25, signed off in the run record): the file triggers are a derived list,
// not a hand list. Every file the run of record hashes as an input (its `inputs.json`
// `configuration.inputs`), every file the public runner hashes (`RUNNER_FILES`) and every file a
// case's `source:` names must be covered by a path both texts name, so a patch that moves any of
// them runs the full set rather than carrying a false "no model-facing change".
const EVAL_SKILL_COPIES: readonly string[] = [
  ".stamity/overrides/skills/st-eval-run/SKILL.md",
  ".claude/skills/st-eval-run/SKILL.md",
];

// `namedPaths` and `uncovered` come from `test/support/pageSections.ts` (ledger build/10).

/** The rule's span in SET-v7, from its trigger clause to its FAIL sentence, whitespace-collapsed. */
const RULE_SPAN_START = "when its diff since the run of record touches";
const RULE_SPAN_END = "A FAIL run of record is never carried forward; the release runs the full set.";

describe("the release eval follows what changed", () => {
  it.each(RELEASE_TRIGGERS)("names %s as a trigger in the checklist and in SET-v7", (trigger, patterns) => {
    for (const [where, text] of releaseRuleTexts()) {
      for (const pattern of patterns) {
        expect(text, `${where} does not name ${trigger} (${String(pattern)})`).toMatch(pattern);
      }
    }
  });

  // MOVED 2026-10-14 (unit r3-hand-page-links, REQ-PROVE-025): "names every file the run of record
  // hashes as an input", "names every file a case's `source:` names" and "names every model role and
  // the client the run of record records" run in `test/records/docsPages.test.ts`, with the readers
  // of the run of record's `inputs.json` they share. That file is a record on the `records` branch;
  // the case below reads `scripts/eval/run.mjs` on `main` and stays.
  it("names every file the public runner hashes, in the checklist and in SET-v7", () => {
    const runnerFiles = RUNNER_FILES as readonly string[];
    expect(runnerFiles.length, "scripts/eval/run.mjs hashes no runner file").toBeGreaterThan(0);
    for (const [where, text] of releaseRuleTexts()) {
      expect(uncovered(runnerFiles, namedPaths(text)), `${where} misses files the public runner hashes`).toEqual([]);
    }
  });

  // ADDED 2026-10-08 (review/26): the eval skill is the route the checklist's eval line runs
  // through, so it states the rule in SET-v7's own words, in the override and in its emitted copy,
  // and never the retired "every release runs the full set".
  it.each(EVAL_SKILL_COPIES)("%s states the release rule in SET-v7's words", (skill) => {
    const set = collapsed(fileSection(EVAL_SET, "## Incremental runs — declared 2026-09-15"));
    const start = set.indexOf(RULE_SPAN_START);
    const end = set.indexOf(RULE_SPAN_END, start);
    expect(start, `${EVAL_SET} has no "${RULE_SPAN_START}"`).toBeGreaterThan(-1);
    expect(end, `${EVAL_SET} has no "${RULE_SPAN_END}" after it`).toBeGreaterThan(start);
    const text = collapsed(read(skill));
    expect(text, `${skill} does not state SET-v7's release rule`).toContain(
      set.slice(start, end + RULE_SPAN_END.length),
    );
    expect(text, `${skill} still states the retired rule`).not.toMatch(/every release runs the full set/i);
  });

  // ADDED 2026-10-08 (review/28, signed off in the run record): who holds admin and registry
  // publish rights is console state no diff shows, so the roster review takes no patch-lane trigger
  // and no window; it runs on every release, a patch included.
  it("reviews the admin roster on every release, a patch included", () => {
    const line = perReleaseLines().find((text) => text.startsWith("A third line"));
    expect(line, `${RELEASE_CHECKLIST} has no "A third line" (the roster review)`).toBeDefined();
    const text = collapsed(line ?? "");
    const runsWhen = text.slice(text.indexOf("Runs when:"));
    expect(runsWhen).toMatch(/^Runs when: every release, a patch included, for the admin roster review/);
    expect(runsWhen, "the roster review still waits on a window").not.toMatch(/\d+ days/);
  });

  it("states the one carried form in the checklist and in SET-v7", () => {
    for (const [where, text] of releaseRuleTexts()) {
      expect(text, `${where} does not state the carried-forward form`).toContain(
        "carried forward from run N: no model-facing change",
      );
    }
  });

  it("gives every per-release line of the checklist its trigger, and states the patch lane", () => {
    const releaseLines = perReleaseLines();
    // Six lines at 2026-10-08 (`grep -cE '^(One|A [a-z]+) line' .github/release-controls-checklist.md`);
    // a floor rather than a count, so a seventh line is checked rather than refused.
    expect(releaseLines.length, `${RELEASE_CHECKLIST} lists fewer per-release lines than it did`).toBeGreaterThanOrEqual(6);
    for (const line of releaseLines) {
      expect(line, `a per-release line names no trigger: "${line.slice(0, 60)}…"`).toContain("Runs when:");
    }
    expect(collapsed(fileSection(RELEASE_CHECKLIST, "## Per-release record currency"))).toMatch(
      /a patch release runs a line only when its `Runs when:` trigger/i,
    );
  });
});

// ADDED 2026-10-14 (unit r3-hand-page-links; REQ-UPSTREAM-007, REQ-PROVE-020, ledger review/6). The
// fork guide's recommended `regenerate` and `generatedPaths` lists, run where a fork runs them: a
// checkout that holds no record. The measurements page renders from records, so `generate-docs.mjs`
// skips it there, and the guide stopped listing it as a generated path; this holds the two to each
// other in a real tree rather than in prose. The same tree drives the generator's refusal at the
// script level, which the pure `measurementsAction` cases cannot reach: the script reads its own
// root, so only a copy of the tree without the records can make it refuse.

/**
 * Whether a repository-relative POSIX path is a record, one the `records` branch keeps rather than
 * `main`: `isRecordPath` from `scripts/records-paths.mjs`, the one list `scripts/records.mjs` reads
 * for every verb, so this suite and the `guard` that refuses a record on `main` cannot disagree.
 *
 * TEST CHANGE, justified (2026-10-14, ledger build/11): this was a regular expression typing the
 * records set a second time; it now reads the set from the module that defines it.
 */
const isRecord = isRecordPath as (path: string) => boolean;

/** A `generatedPaths` glob as the lane reads one: `**` crosses folders, `*` stays inside one. */
const globPattern = (glob: string): RegExp =>
  new RegExp(
    `^${glob
      .split(/(\*\*|\*)/)
      .map((part) => (part === "**" ? ".*" : part === "*" ? "[^/]*" : part.replace(/[.+?^${}()|[\]\\]/g, "\\$&")))
      .join("")}$`,
  );

/** The fork guide's example configuration, read off its one JSON block under the heading. */
const forkGuideConfiguration = (): { regenerate: string[]; generatedPaths: string[] } => {
  const section = sectionOf(read(ENTERPRISE_FORKS), "### Start from these values for a fork of this repository");
  const [block] = fencedBlocksOf(section, "json");
  expect(block, `${ENTERPRISE_FORKS} carries no example configuration`).toBeDefined();
  return JSON.parse(block ?? "{}") as { regenerate: string[]; generatedPaths: string[] };
};

/**
 * Every file `git ls-files` lists outside the records set, copied into a fresh temp folder that is
 * then committed as a repository of its own, so `git status` there reads what a run rewrote.
 * `node_modules` is linked rather than copied: the generators import their dependencies from it,
 * and nothing they write lands under it.
 */
function recordsFreeTree(): string {
  const root = mkdtempSync(join(tmpdir(), "stamity-records-free-"));
  const listed = execFileSync("git", ["ls-files", "-z"], { cwd: REPO_ROOT, encoding: "utf-8" })
    .split("\0")
    .filter((path) => path !== "" && !isRecord(path));
  for (const path of listed) {
    if (!existsSync(join(REPO_ROOT, path))) continue;
    mkdirSync(dirname(join(root, path)), { recursive: true });
    copyFileSync(join(REPO_ROOT, path), join(root, path));
  }
  symlinkSync(join(REPO_ROOT, "node_modules"), join(root, "node_modules"), "junction");
  const git = (...args: string[]): string =>
    execFileSync(
      "git",
      ["-c", "core.autocrlf=false", "-c", "user.name=fixture", "-c", "user.email=fixture", "-c", "commit.gpgsign=false", ...args],
      { cwd: root, encoding: "utf-8" },
    );
  git("init", "-q");
  git("add", "-A");
  git("commit", "-q", "--no-verify", "-m", "records-free fixture");
  return root;
}

describe("the fork guide's lists in a checkout with no records", () => {
  const roots: string[] = [];
  afterAll(() => {
    for (const root of roots) {
      rmSync(join(root, "node_modules"), { force: true });
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("no longer lists or justifies the measurements page as a generated path", () => {
    const { generatedPaths } = forkGuideConfiguration();
    expect(generatedPaths.length, "the guide's generatedPaths read as empty").toBeGreaterThan(0);
    expect(generatedPaths, "the guide still lists the measurements page").not.toContain(MEASUREMENTS_DOC_PATH);
    expect(read(ENTERPRISE_FORKS), "the guide still names the measurements page's path").not.toContain(
      MEASUREMENTS_DOC_PATH,
    );
    expect(flowed(read(ENTERPRISE_FORKS)), "the guide never says why the page is not listed").toContain(
      flowed("The measurements page is not listed: a fork holds no records, so\n`generate-docs.mjs` skips that page there"),
    );
  });

  it(
    "runs the regenerate list with the page skipped and nothing rewritten outside generatedPaths, and refuses the page alone",
    () => {
      const root = recordsFreeTree();
      roots.push(root);
      const committedPage = readFileSync(join(root, MEASUREMENTS_DOC_PATH), "utf-8");
      const inputs = measurementInputs(root);
      expect(inputs.present, "the records-free tree still holds a measurements input").toEqual([]);
      expect(inputs.missing.length, "the generator names no measurements input").toBeGreaterThanOrEqual(3);
      const notice =
        `generate-docs: measurements page skipped — no records in this checkout (missing ${inputs.missing.join(", ")}); ` +
        "node scripts/records.mjs restore brings them";
      const run = (script: string, args: readonly string[]) =>
        spawnSync(process.execPath, [join(root, script), ...args], { cwd: root, encoding: "utf-8" });

      // The guide's list, every command that runs a generator script. The two npm commands are left
      // out, and named, so a command joining the list is a decision rather than a silent skip: the
      // linked `node_modules` is what the install would have made, and the build-and-sync writes
      // only `dist/` and the emitted client files the dogfood check covers.
      const { regenerate, generatedPaths } = forkGuideConfiguration();
      const scripts = regenerate.filter((command) => /^node scripts\/\S+\.mjs(?: |$)/.test(command));
      expect(regenerate.filter((command) => !scripts.includes(command))).toEqual([
        "npm ci --ignore-scripts",
        "npm run build && node dist/cli.js sync",
      ]);
      expect(scripts, "the guide's regenerate list no longer runs generate-docs.mjs").toContain(
        "node scripts/generate-docs.mjs",
      );
      for (const command of scripts) {
        const [, script = "", ...args] = command.split(" ");
        const result = run(script, args);
        expect(result.status, `\`${command}\` failed with no records:\n${result.stderr}`).toBe(0);
        if (script === "scripts/generate-docs.mjs") expect(result.stderr).toContain(notice);
      }
      expect(readFileSync(join(root, MEASUREMENTS_DOC_PATH), "utf-8"), "the page moved with no records").toBe(
        committedPage,
      );
      const rewritten = execFileSync("git", ["-c", "core.autocrlf=false", "status", "--porcelain", "-z", "--untracked-files=all"], {
        cwd: root,
        encoding: "utf-8",
      })
        .split("\0")
        .filter((entry) => entry !== "")
        .map((entry) => entry.slice(3));
      const globs = generatedPaths.map(globPattern);
      expect(
        rewritten.filter((path) => !globs.some((glob) => glob.test(path))),
        "the regenerate list rewrote a path the guide's generatedPaths does not list",
      ).toEqual([]);

      // `--page all` names the same skip, and `--page measurements` asks for the page itself, so it
      // refuses before any write, naming every input it lacks.
      const all = run("scripts/generate-docs.mjs", ["--page", "all"]);
      expect(all.status, all.stderr).toBe(0);
      expect(all.stderr).toContain(notice);
      const alone = run("scripts/generate-docs.mjs", ["--page", "measurements"]);
      expect(alone.status, "the page alone rendered with no records").toBe(1);
      expect(alone.stderr).toContain(`generate-docs: the measurements page needs ${inputs.missing.join(", ")}`);
      expect(alone.stdout, "the refused run wrote a page").not.toContain("Wrote ");
      expect(readFileSync(join(root, MEASUREMENTS_DOC_PATH), "utf-8")).toBe(committedPage);
    },
    120_000,
  );
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

  it("says Codex starts its touchpoints as $st-<id> while its adapter declares that surface", () => {
    // TEST CHANGE, justified (sw17-touchpoints-as-shared-skills, REQ-FLOW-026): this pinned the
    // README's "Codex has no repository-level command home" to a codex cap reading "none". The
    // cap moved — the nine touchpoints ship to Codex as shared skills, invoked as `$st-<id>` —
    // so the same tie is kept the other way round: the README and the guides say what the cap
    // says, and none of them still says Codex has no command home.
    const matrix = read(CAPABILITY_MATRIX);
    const sectionStart = matrix.indexOf("### `codex`");
    expect(sectionStart, "capability matrix has no codex section").toBeGreaterThanOrEqual(0);

    const declared = (CODEX_COMMAND_SURFACE.exec(matrix.slice(sectionStart))?.[1] ?? "").trim();
    expect(declared, "codex declares no command-surface cap").not.toBe("");
    expect(declared).toContain("`.agents/skills/st-<id>/SKILL.md`");
    expect(declared).toContain("`$st-<id>`");

    const readme = read(README);
    expect(readme).toMatch(/Codex starts one as\s+`\$st-<id>`/);
    for (const page of [README, "docs/working-with-stamity.md", "docs/troubleshooting.md", "docs/getting-started.md"]) {
      expect(read(page), page).not.toMatch(/no\s+(?:repository-level|repo-level)\s+command\s+home/);
      expect(read(page), page).not.toContain(".cursor/skills");
    }
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
    // After a compaction or on a resume the session-start hook and `stamity ledger status`
    // read the record head, ledger ids, report names and lane paths back into the model's
    // context and the terminal — and, with no run in progress, a recent closed run's
    // `Status:` text, plus the run ids of open debug rounds, which alone print a card naming
    // no run (sw07, MODIFIED REQ-CTX-013). The table names the control at the
    // symbols that run it, and the residual names the screen subset and the unscreened
    // files the card points at.
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
    expect(row).toMatch(/After a compaction or on a resume/);
    expect(row).toMatch(/closed card[^|]*closing `Status:` value/);
    expect(row).toMatch(/`_debug-`[^|]*never picked/);
    expect(row).toMatch(/`debug rounds open:` line[^|]*names no run/);
    expect(row).toMatch(/no run in progress` on the card that names none/);
    expect(row).toMatch(/full lists and the record's status/);
  });

  // ADDED 2026-10-19 (plan 021 file 2, units v1-branch-card and v0d-guard-pages; REQ-CTX-013, review/12): the card
  // also prints on a fresh start, for the run in progress on the checked-out branch, and `ledger status --json` names
  // the record's branch; the residual names a planted record on a branch and the startup source.
  it("states the resume card's startup print for the run on this branch", () => {
    const flat = text.replace(/\s+/g, " ");
    const row = flat.slice(flat.indexOf("through the resume card"), flat.indexOf("| A verdict role or the orchestrating session"));
    expect(row).toContain("on a fresh start (`startup`) only the card of the run in progress whose record's `Branch:` names the branch `.git/HEAD` names");
    expect(row).toContain("an attended record only while it is dated within the last two UTC days, an unattended one at any age");
    expect(row).toContain("its `--json` adds the record's `branch`, screened with the lists, and `onCurrentBranch`");
    expect(row).toContain("a startup prints neither that card nor the closed one");
    expect(row).toContain("A client whose hook sends no compaction, resume or startup source never prints the card");
    expect(row).not.toContain("neither a compaction nor a resume source");
  });

  // ADDED 2026-10-16 (plan 021 file 1, unit u21-security-page, REQ-FLOW-104): the cloud and
  // unattended runs land with controls the table names at the symbols that run them, and with
  // accepted risks the page names in the words the requirement uses. The old "Runs nobody
  // watches" bullet said nothing stopped such a run from pushing to `main`; with the pre-flight,
  // the shell guard and the run verbs shipped, that sentence is false, so it may not come back.
  describe("cloud and unattended runs (REQ-FLOW-104)", () => {
    const flat = text.replace(/\s+/g, " ");
    const section = (start: string, end: string): string => {
      const from = flat.indexOf(start);
      const to = flat.indexOf(end, from + start.length);
      expect(from, `SECURITY.md has no "${start}"`).toBeGreaterThanOrEqual(0);
      expect(to, `SECURITY.md has no "${end}" after "${start}"`).toBeGreaterThan(from);
      return flat.slice(from, to);
    };

    it("names the cloud's accepted risks under what it does not defend", () => {
      const residuals = section("### Cloud and unattended runs", "## Standards mapping");
      expect(flat.indexOf("### Cloud and unattended runs")).toBeGreaterThan(flat.indexOf("## What it does not defend"));
      expect(flat, "the retired bullet is back").not.toContain("Runs nobody watches");
      for (const risk of [
        "screened by the model, not enforced",
        "a Copilot hook that times out fails open",
        "Cursor's read-only first turns run no hooks",
        "no shell guard sees Cursor's own push",
        "a pattern deny rule can be respelled",
        "every command in Claude Code's cloud can read the environment",
        "a run that rewrites its own record head escapes the unattended push rule",
        "Codex's non-interactive mode was seen running no project hooks",
        "a repository's own push configuration",
        "a GraphQL mutation read from a file",
        "the platform's shared app identity",
        "a custom repository role that can edit rules",
        "a custom organization role that manages rulesets",
        "an administrator's repository-level acts",
        "`PATH` decides which `gh`",
        "a `GIT_CONFIG_*` value changed between the pre-flight and the push",
        "an environment file can name a build file outside the held set",
      ]) {
        // Without case: a risk may open its sentence on the page.
        expect(residuals.toLowerCase(), `the cloud section does not name: ${risk}`).toContain(risk.toLowerCase());
      }
      // The attended forms the guard reads, which the unattended rules refuse as well, and the two they do not cover.
      // TEST CHANGE, justified (plan 022 file 1, unit a16-security-pages; REQ-FLOW-104, inbox row pr/40): the guard
      // fills gh's placeholders from the checkout's branch and reads a batch ref update's hidden list element as a ref
      // it cannot show (src/hooks/personOnly.ts::personOnlyVerdict, httpVerdict's `fill` and the `refUpdates` read), so
      // the page states both as read, asking, and no longer lists them as passing; the three pins move to that reading.
      expect(residuals, "the page lists the attended guard's accepted gaps again").not.toContain("The attended guard's accepted gaps");
      for (const gap of [
        "gh's own field conversions and its current-branch placeholder are read as gh fills them, from the branch the checkout is on",
        "asks as a push of that branch",
        "a batch ref update whose list element is given whole as a GraphQL variable names a ref the line cannot show, which asks as a push of the default branch",
        "tag-ref create",
        "percent-encoded",
        "a directory change",
        "PowerShell's command wrappers",
        "gh's alias for the create-and-push form",
      ]) {
        expect(residuals.toLowerCase(), `the cloud section does not name: ${gap}`).toContain(gap.toLowerCase());
      }
      // The nested lines both verdicts read, gh's create-and-push alias, a Windows-path git in a PowerShell payload,
      // a directory change inside a nested line and an unattended `-c` pair outside the display and identity keys are
      // stated as read or refused, never as gaps again, as the guard round at 445ebd23 made them; what the code still
      // passes is listed as the gaps the unattended rules do not cover, and the config-named program beside the
      // respelling residual; since 372a3d2d `Set-Item env:` and `New-Item env:` are refused spellings of git's
      // variables, and only PowerShell's other `env:` drive commands stay a respelling.
      expect(residuals).toContain("Gaps the unattended rules do not cover:");
      expect(residuals).toContain("Lines that run inside another line are read as their own by both verdicts");
      expect(residuals).toContain("`gh repo new --push`, is refused in an unattended run");
      for (const stale of [
        "are not read by the always-on verdict",
        "is not read by the unattended rule",
        "Two gaps are not covered",
        "being closed",
        "is not followed",
        "the guard reads the payload's backslashes as a POSIX shell's escapes",
        "but not a `-c` pair naming",
      ]) {
        expect(flat, `SECURITY.md says again: ${stale}`).not.toContain(stale);
      }
      for (const named of [
        "a PowerShell encoded command (`-EncodedCommand`)",
        "a line another command pipes into `iex`",
        "a git named by a Windows path inside a PowerShell payload (`C:\\…\\git.exe push`) is read as git by both verdicts",
        "The guard's place reader follows a directory change inside each of those lines too, a `cmd /c` or `/k` line",
        "Programs the repository's configuration names",
        "no reading of one command line closes this",
        "a git call carrying a `-c` or `--config-env` pair outside the display and identity keys",
        "`git -c core.fsmonitor=… status` among them",
        "`Set-Item env:` and `New-Item env:` and `[Environment]::SetEnvironmentVariable` among the spellings",
        // A `declare`, `typeset` or `local` export with no value is a refused spelling too (review/243), and so are the
        // forms that assign with no `=` and allexport turned on (review/247), with the builtins the rule does not read.
        "`export`, and `declare`, `typeset` or `local` given `-x`, with a value or without one, a name `read`, `for`, `printf -v`, `mapfile`, `readarray` or `getopts` assigns with no `=`",
        "any of them named on a line that turns allexport on with `set`'s letter or the option's name (`set -a`, `set -o allexport`, `setopt allexport`), PowerShell's `$env:`",
        "`Set-Content env:GIT_EXEC_PATH …`, passes, and the respelling residual above covers it",
        // The spellings the line-wide rule does not read, each named with the control that holds; the allexport
        // spellings the rule does not read among them, and no array form.
        // TEST CHANGE, justified (plan 021 file 2, v0b and v0d; REQ-FLOW-121, REQ-FLOW-122): a run verb now stands
        // alone on its line, so these spellings no longer ride the verb's own line; they pass only on an earlier line
        // of a shell that persists, where the verb's git drops a program-valued variable and keeps a `GIT_CONFIG_*`
        // one. The pins move from "the verb's git runs in" and "on the line" / "before the verb" to that reading.
        "These spellings pass the rule too, on a line of their own in a shell that persists, and each changes the environment a later verb's git starts from",
        // TEST CHANGE, justified (plan 022 file 1, unit a16-security-pages; REQ-FLOW-104, inbox row review/252): the
        // assignment form without the colon passes the unattended rule as the colon form does (measured on the lane's
        // src/hooks/personOnly.ts::unattendedPushVerdict), so the page lists it beside it.
        "`readonly NAME=…`, `select`, zsh's `print -v` and `foreach`, `: ${NAME:=…}` and `: ${NAME=…}`, each of which sets a value that reaches it when the variable is already in the environment",
        "zsh's `readonly -x NAME=…`, which exports the variable whether or not it was before",
        "allexport turned on by zsh's `setopt -a` or by a shell started with `-a` (`bash -a -c '…'`), which exports a variable one of those forms then sets",
        "`source <file>` (or `. <file>`), since the guard does not read the file, which can set or export any of them",
        "On the verb's own line each is refused, since the verb stands alone there",
        "Set on an earlier line, a program-valued variable is removed from the verb's git, which names it, and a `GIT_CONFIG_*` one is kept",
        "The control that holds is the pre-flight's refusal of an account that can push to the default branch: a push such a git makes meets the protection the pre-flight proved there, and reaches any other branch unheld",
      ]) {
        expect(residuals, `the cloud section does not name: ${named}`).toContain(named);
      }
      expect(residuals, "the cloud section says again that a variable set on a verb's line reaches its push").not.toContain(
        "so a variable set on a verb's line reaches its push",
      );
      for (const stale of [
        "any of them named on a line that turns allexport on (`set -a`",
        "one another builtin sets on a line that leaves allexport off",
        "`set -A`",
      ]) {
        expect(residuals, `the cloud section says again: ${stale}`).not.toContain(stale);
      }
      // The editor's workspace file and every folder's settings and tasks files are held, no gap (build/77, review/186),
      // and every folder's editor MCP-server file with them.
      expect(residuals).toContain("every folder's editor settings and tasks files with their");
      expect(residuals).toContain("every folder's editor MCP-server");
      expect(flat, "SECURITY.md says again the editor files are not held").not.toMatch(/folder-open task are not held/);
    });

    // ADDED 2026-10-16 (plan 021 file 1, unit u21-security-page, fix round 1): the page states
    // what the code does and no more. No run verb reads a pre-flight verdict, so the pre-flight
    // is the skill's first act, not an engine gate; the REST check guards the default branch
    // alone, so it is no backstop for a respelled push; `run end` opens no pull request for a
    // run held before its push; and the run verbs' held-path refusal on history, their scan of
    // the commits `origin` lacks and the record head's reach into their hold stay named.
    it("claims no gate the engine does not run, and names the run verbs' history controls", () => {
      const table = section("## What the engine defends today", "## Network and data handling");
      const residuals = section("### Cloud and unattended runs", "## Standards mapping");
      for (const overstated of [
        "starts only through the pre-flight",
        "the run starts only when every check passes",
        "the pre-flight refuses to start without one",
        "is the wall behind",
        "draft pull request every time",
      ]) {
        expect(flat, `SECURITY.md says again: ${overstated}`).not.toContain(overstated);
      }
      // TEST CHANGE, justified (plan 022 file 1, unit a16-security-pages; REQ-FLOW-131, REQ-FLOW-104): an unattended
      // `run checkpoint`, `run end` and `run land` refuse without the record a pre-flight writes
      // (src/runs/gitSurface.ts::checkSurfaceRecord), so the row no longer says no verb reads the pre-flight; it still
      // claims no gate on the verdict itself, and `run start` runs without one.
      expect(table).toContain("`run start` runs without a pre-flight. The verdict is not a gate on the later verbs either, but its record is");
      expect(table).toContain("exit 1 with `no pre-flight record` where none reads");
      expect(residuals).toContain("no run verb requires a passing verdict");
      expect(residuals).toContain("only an organization ruleset counts");
      for (const page of [table, residuals]) {
        expect(page).toContain("guards only the default branch");
        expect(page).toContain("a `-c alias.*` pair");
        expect(page).toContain("a line whose program word is computed");
      }
      const verbs = section("`stamity run start` puts an unattended run", "| Anyone whose text an unattended run sends out");
      expect(verbs).toContain("while a commit the push would send");
      // TEST CHANGE, justified: pr/46 (signed off 2026-10-17) reads what origin holds with `git ls-remote origin`, so the
      // row names that read in place of the remote-tracking refs, the commits below `Base:` still included.
      expect(verbs).toContain(
        "every commit none of origin's branches and tags reaches, read from the remote with `git ls-remote origin` and never from a remote-tracking ref, those below `Base:` included",
      );
      expect(verbs).toContain("so a run held there opens none");
      expect(verbs).toContain("with no `Mode:` line in the record's head while `STAMITY_UNATTENDED` is set");
      const wall = section("`stamity gate preflight --unattended` is the `st-unattended` skill's first act", "| The main thread of any session");
      expect(wall).toContain("A classic bypass list that names any team or app reads `unknown`");
      const network = section("## Network and data handling", "## Publishing this package");
      expect(network).toContain("the account's own login where that protection's pull-request bypass lists users");
      expect(residuals).toContain("turns off their hold too");
    });

    it("cites the pre-flight, the shell guard, the run verbs and the outbound screen as controls", () => {
      const table = section("## What the engine defends today", "## Network and data handling");
      for (const pointer of [
        "`src/runs/preflight.ts::runPreflight`",
        "`src/runs/preflight.ts::inspectDirectPush`",
        "`src/hooks/personOnly.ts::personOnlyVerdict`",
        "`src/hooks/personOnly.ts::unattendedPushVerdict`",
        "`src/hooks/scripts.ts::buildPersonOnlyGuardScript`",
        "`src/cli/commands/run.ts::runCheckpoint`",
        "`src/change/personOnlyPaths.ts::heldPaths`",
        "`src/runs/morning.ts::screenOutbound`",
        "`src/change/scan.ts::scanAddedLines`",
      ]) {
        expect(table, `the control table does not cite ${pointer}`).toContain(pointer);
      }
      // The run verbs join the git-hardening row, by the runner they start git through.
      const hardening = table.split(" | Any repository writer, a pull request included | Committing a folder")[1] ?? "";
      expect(hardening, "the git-hardening row is gone").not.toBe("");
      expect(hardening.split(" | Any repository writer")[0]).toContain("`src/cli/engine/gitWrite.ts::gitWrite`");
    });

    it("restates the settings promise to what clean does with a deny row", () => {
      const row = section("Any tool or person editing a client config the engine also writes", "| A pull request author |");
      expect(row).toContain("removes no `permissions.deny` row");
      // TEST CHANGE, justified (plan 021 file 2, v0a2 and v0d; REQ-FLOW-036, REQ-FLOW-104): the engine now writes
      // `permissions.ask` rows beside the deny rows and `clean` keeps both lists, naming rows equal to either table's,
      // so the pin reads both lists, and the unreleased build's leftover deny rows are named as REQ-FLOW-104 asks.
      // TEST CHANGE, justified (plan 022 file 1, unit a16-security-pages; REQ-FLOW-036, REQ-FLOW-123): an ask row the
      // autonomy setting no longer renders leaves at `sync` when the ledger record lists it, and an unrecorded equal
      // row is kept and named (src/manifest/claudeSettings.ts, `leavingRows` and `withRowNotice`), so "no ask row"
      // moves to that rule; the forged-record residual is named beside it.
      expect(row).toContain("and an ask row only where the current setting no longer renders it and the ledger record lists its hash");
      expect(row).toContain("a forged record that lists an owner's own ready-mark or local-tag ask row makes `sync` remove it");
      expect(row).toMatch(/`clean` leaves every row of both lists and names those equal to an engine row of either table/);
      expect(row).toContain("a checkout synced from an unreleased build before 1.16.0 keeps the deny rows that build wrote for acts that now ask");
      expect(row).toContain("`src/manifest/claudeSettings.ts::reduceClaudeSettingsToForeignContent`");
    });

    it("lists the engine's start of gh among its named network exceptions", () => {
      const network = section("## Network and data handling", "## Publishing this package");
      expect(network).toContain("with the three exceptions named next");
      expect(network).toContain("`src/cli/engine/ghRunner.ts::ghApi`");
      expect(network).toContain("`gh api`");
    });

    // ADDED 2026-10-16 (plan 021 file 1, the whole-branch round's page fix): the pre-flight now
    // refuses an account with no push right, the run verbs pin origin's push as git resolves it and
    // hold a link at a held glob's folder, and the guard refuses a review approval, a branch-deleting
    // close, remote writes and git's program variables, while Claude Code denies the GitHub MCP
    // server's merge and branch tools. What that leaves open is named in plain words. A
    // `url.*` config write is refused beside a `remote.*` one, the origin pin the second check, and
    // the page no longer says such a write passes the guard.
    it("states the origin pin, the held links, the new refusals and what they leave open", () => {
      const table = section("## What the engine defends today", "## Network and data handling");
      const residuals = section("### Cloud and unattended runs", "## Standards mapping");
      const wall = section("`stamity gate preflight --unattended` is the `st-unattended` skill's first act", "| The main thread of any session");
      const guard = section("| The main thread of any session", "| An unattended run, or the text that steers one | Pushing a change");
      const verbs = section("`stamity run start` puts an unattended run", "| Anyone whose text an unattended run sends out");
      expect(wall).toContain("An account with no push right on the repository at all (`permissions.push` false) is refused");
      expect(residuals).toContain("an account with no push right at all is refused");
      for (const stale of ["or an account with no push right on the repository", "and so does an account with no push right"]) {
        expect(flat, `SECURITY.md says again: ${stale}`).not.toContain(stale);
      }
      for (const claim of [
        "`run start` pins origin's repository in the run folder's `origin.json`",
        "from every push URL as git resolves it, `insteadOf` and `pushInsteadOf` applied",
        "refuses as `origin changed`",
        "`Not done: origin changed`",
        "refuses as `origin not pinned`",
        "A symbolic link the change adds or retypes at a held glob's folder",
      ]) {
        expect(verbs, `the run verbs' row does not state: ${claim}`).toContain(claim);
      }
      for (const claim of [
        "a pull request closed with `--delete-branch` among them",
        "a merge or a review approval",
        "`gh pr close` and `gh pr reopen`",
        "a `git remote` write",
        "a `git config` write of a `remote.*` or `url.*` key or section",
        "one of git's program-valued variables",
        // MOVED 2026-10-18 (PR #112 round 4): create_pull_request joined the MCP rows, thirteen to fourteen.
        // TEST CHANGE, justified (plan 021 file 2, v0a, v0a2 and v0d; REQ-FLOW-102, REQ-FLOW-123, REQ-FLOW-124):
        // attended, an act that can be undone now asks on Claude Code and is refused elsewhere, and only deletions,
        // force pushes and acts that cannot be undone stay refused everywhere, so the page's claim moves with it.
        // Thirteen of the fourteen rows ask and one denies.
        "Fourteen rows more name the GitHub MCP server's tools",
        "thirteen ask rows",
        "and one deny row, repository deletion (`delete_repository`)",
      ]) {
        expect(guard, `the guard's row does not state: ${claim}`).toContain(claim);
      }
      for (const pointer of [
        "`src/cli/commands/run.ts::pinOrigin`",
        "`src/cli/commands/run.ts::originRefusal`",
        "`src/cli/commands/run.ts::heldOf`",
        "`src/hooks/personOnly.ts::CLAUDE_DENY_ROWS`",
      ]) {
        expect(table, `the control table does not cite ${pointer}`).toContain(pointer);
      }
      for (const residual of [
        "The GitHub MCP server on the other clients.",
        "Cursor, Copilot and Codex take no per-tool deny from the engine",
        "The origin pin.",
        "together with git's configuration (`.git/config`)",
        "a `git config` write of a `remote.*` or `url.*` key, and the pin is the second check",
        "meets it at the next `run checkpoint` or `run end`, which refuses the push",
        "Claude Code keeps the shell's working directory from one call to the next",
        "Whether Claude Code's field follows a directory an earlier call moved to was not checked",
        "This is attended only",
        "one of git's program-valued variables",
      ]) {
        expect(residuals, `the cloud section does not name: ${residual}`).toContain(residual);
      }
      expect(flat, "SECURITY.md says again that a url.* write passes the guard").not.toMatch(/`url\.\*` key passes/);
      expect(guard, "the guard's row names a url.* write as a gap").not.toContain("a `git config` write of a `url.*` key among them");
    });

    // ADDED 2026-10-16 (plan 021 file 1, the whole-branch round's second page fix): Claude Code's
    // deny rows name thirteen GitHub MCP tools, read from the server's tool list on that date, a
    // server configured under another name escaping them; the run verbs keep the repository's
    // hooks, so a hook the run writes is named beside the configured-program residual; and,
    // unattended, a line setting git's program or configuration variables is refused whatever
    // program it runs, `GIT_CONFIG_GLOBAL` and `GIT_CONFIG_SYSTEM` joining the set, and
    // `gh pr update-branch` is refused.
    // MOVED 2026-10-18 (PR #112 round 4): fourteen rows, create_pull_request among them.
    it("states the fourteen MCP rows, the hooks residual and the any-program variable rule", () => {
      const guard = section("| The main thread of any session", "| An unattended run, or the text that steers one | Pushing a change");
      const residuals = section("### Cloud and unattended runs", "## Standards mapping");
      for (const tool of [
        "merge_pull_request",
        "push_files",
        "create_or_update_file",
        "delete_file",
        "update_pull_request_branch",
        "create_branch",
        "pull_request_review_write",
        "create_pull_request_review",
        "submit_pending_pull_request_review",
        "update_pull_request",
        "update_pull_request_state",
        "update_pull_request_draft_state",
        "create_pull_request",
        "delete_repository",
      ]) {
        expect(guard, `the guard's row does not name the MCP tool ${tool}`).toContain(`\`${tool}\``);
      }
      for (const claim of [
        "as the server's published tool list named them when read on 2026-10-16",
        // TEST CHANGE, justified (plan 021 file 2, v0a, v0a2 and v0d; REQ-FLOW-102, REQ-FLOW-123, REQ-FLOW-124):
        // attended, an act that can be undone now asks on Claude Code and is refused elsewhere, and only deletions,
        // force pushes and acts that cannot be undone stay refused everywhere, so the page's claim moves with it.
        "A row cannot read a tool's arguments, so each tool is classed whole: a pull-request update through that server asks whole",
        "A `PreToolUse` entry on those fourteen tools runs the person-only guard, with its fail-closed tail",
        "the MCP rows name a server configured as `github`, so one configured under another name escapes them",
        "A hook the run writes runs when a run verb commits or pushes",
        "`gh pr update-branch`",
        // TEST CHANGE, justified (plan 021 file 2, v0b and v0d; REQ-FLOW-121): a run verb's line is now refused unless
        // the verb stands alone on it, which the row states in place of "a `stamity run` line among them".
        "`GIT_CONFIG_GLOBAL`, `GIT_CONFIG_SYSTEM`) anywhere on it, whatever program it runs, and a line that runs `stamity run start`, `checkpoint` or `end`",
        "unless the verb stands alone on it as one simple command",
      ]) {
        expect(guard, `the guard's row does not state: ${claim}`).toContain(claim);
      }
      for (const residual of [
        // TEST CHANGE, justified (plan 021 file 2, v0a, v0a2 and v0d; REQ-FLOW-102, REQ-FLOW-123, REQ-FLOW-124):
        // attended, an act that can be undone now asks on Claude Code and is refused elsewhere, and only deletions,
        // force pushes and acts that cannot be undone stay refused everywhere, so the page's claim moves with it.
        "thirteen `permissions.ask` rows and one `permissions.deny` row name the GitHub MCP server's merge",
        "a merge, a branch write, a review approval or a ready-for-review mark it makes is a tool call",
        "the rows name a server configured as `github`, the key the engine writes, so the same server configured under another name escapes them",
        "Hooks the run writes.",
        "The run verbs keep the repository's hooks",
        "a hook a run writes runs when `run checkpoint` or `run end` commits or pushes",
        "The control that holds is the pre-flight's refusal of an account that can push to the default branch",
        "Unattended too, a line is refused whatever program it runs, a `stamity run checkpoint` or `run end` line, `npx`, `node` and `npm test` alike, when it sets one of git's configuration variables",
        // TEST CHANGE, justified (plan 022 file 1, unit a16-security-pages; REQ-FLOW-104, inbox row review/252): the rule
        // refuses the forms it reads, and the page lists the forms that pass, so "in any form that sets one" overstated it.
        "`GIT_CONFIG_GLOBAL`, `GIT_CONFIG_SYSTEM`), in the forms the guard reads",
        // TEST CHANGE, justified (plan 021 file 2, v0b and v0d; REQ-FLOW-121): nothing rides a run verb's own line any
        // more, so a variable set there no longer reaches its push.
        "A run verb's own line holds the verb alone, so no spelling of any kind rides it",
        "`src/cli/engine/gitWrite.ts::gitWriteEnv`",
        "`src/cli/engine/gitWrite.ts::gitWrite`",
      ]) {
        expect(residuals, `the cloud section does not name: ${residual}`).toContain(residual);
      }
      // The programs residual precedes the hooks one, so the hook is named beside it.
      expect(residuals.indexOf("Hooks the run writes.")).toBeGreaterThan(residuals.indexOf("Programs the repository's configuration names"));
      expect(residuals.indexOf("Hooks the run writes.")).toBeLessThan(residuals.indexOf("The environment."));
      for (const stale of [
        "five rows more deny",
        "five `permissions.deny` rows",
        "thirteen rows more deny",
        "thirteen `permissions.deny` rows",
        "fourteen rows more deny",
        "fourteen `permissions.deny` rows",
        "and a git call on a line that sets one of git's program-valued variables",
        "PowerShell's `Set-Item env:GIT_CONFIG_COUNT 1` among them, passes",
        "PowerShell's `Set-Item env:GIT_EDITOR …` among them, passes",
        "a GraphQL mutation or a REST body read from a file. The guard",
      ]) {
        expect(flat, `SECURITY.md says again: ${stale}`).not.toContain(stale);
      }
    });

    // ADDED 2026-10-16 (plan 021 file 1, the final derived lane): the environment the run verbs
    // start under picks the git they run and the global configuration it reads, named beside the
    // residual it shares a class with (`PATH` deciding which `gh` runs), the pre-flight's
    // push-right refusal the control that holds; and a REST review write whose body the line
    // cannot show is refused as an approval, so the guard's gap cell no longer lists it as passing.
    it("names the run verbs' environment and the REST review body the line cannot show", () => {
      const guard = section("| The main thread of any session", "| An unattended run, or the text that steers one | Pushing a change");
      const residuals = section("### Cloud and unattended runs", "## Standards mapping");
      // TEST CHANGE, justified (plan 021 file 2, v0a and v0d): a repository settings PATCH and a `git/refs` PATCH whose
      // body the line hides are refused now too, beside the review, so the gap cell names all three.
      expect(guard).toContain(
        "a GraphQL mutation read from a file, and a REST body read from a file, except where the guard reads a body the line cannot show as the refusing value: a review, refused as an approval, a repository settings `PATCH`, refused as a visibility change, and a `git/refs` `PATCH`, refused as a forced ref update (`src/hooks/personOnly.ts::personOnlyVerdict`)",
      );
      for (const claim of [
        "The run verbs' environment.",
        "The environment the run verbs start under picks the git they run and the global configuration it reads",
        "`HOME` and `XDG_CONFIG_HOME` choose the global configuration file",
        // TEST CHANGE, justified (plan 021 file 2, v0b and v0d; REQ-FLOW-121): set on the verb's own line they are
        // refused now; only set earlier, or by the platform, do they reach its git.
        "Set on the verb's own line they are refused, since the verb stands alone there",
        "set earlier in a shell that persists, or by the platform, they reach its git, since the push rule reads git's own variables only",
        "`src/shared/programPath.ts::gitProgramFor`",
      ]) {
        expect(residuals, `the cloud section does not state: ${claim}`).toContain(claim);
      }
      // Beside the residual it shares a class with, and the control that holds named in it.
      const environment = residuals.indexOf("The run verbs' environment.");
      expect(environment).toBeGreaterThan(residuals.indexOf("`PATH` decides which `gh`"));
      expect(environment).toBeLessThan(residuals.indexOf("The configuration window."));
      expect(residuals.slice(environment, residuals.indexOf("The configuration window."))).toContain(
        "The control that holds is the pre-flight's refusal of an account that can push to the default branch",
      );
    });

    // ADDED 2026-10-16 (PR #112 round, REQ-FLOW-104): the attended verdict refuses a GraphQL tag-ref create, a GraphQL
    // ref delete and a percent-encoded ref path (src/hooks/personOnly.ts::personOnlyVerdict, the DENY rows in
    // test/hooks/personOnly.test.ts), so the page may not list them as passing; and a gh behind a shim is refused by
    // path, the bare helper its way out (src/runs/preflight.ts::isGhCredentialHelper).
    it("states the GraphQL ref forms and a percent-encoded ref path as refused, and names a gh behind a shim", () => {
      const residuals = section("### Cloud and unattended runs", "## Standards mapping");
      for (const claim of [
        // TEST CHANGE, justified (plan 021 file 2, v0a and v0d; REQ-FLOW-102, REQ-FLOW-124): a tag write is ask-class
        // and a ref deletion refuse-class, so the GraphQL forms are read in an attended session and answered by class.
        "The GraphQL forms of a tag-ref create and of a ref delete are read in an attended session too, as their REST twins are, the create asking and the delete refused",
        "a ref path with a percent-encoded letter is read decoded, so it is refused as the ref it names",
        "A `gh` behind a shim.",
        "a gh installed behind a shim (scoop, Chocolatey, mise, asdf, snap), whose `gh auth setup-git` writes the real executable's path, is refused by path",
        "The way out is the bare `!gh auth git-credential` helper",
        "matched as exactly `gh` or `gh.exe` with no case fold",
        "`src/runs/preflight.ts::isGhCredentialHelper`",
      ]) {
        expect(residuals, `the cloud section does not state: ${claim}`).toContain(claim);
      }
      for (const stale of [
        "the GraphQL forms of a tag-ref create and of a ref delete pass",
        "a ref path with a percent-encoded letter passes",
      ]) {
        expect(flat, `SECURITY.md says again: ${stale}`).not.toContain(stale);
      }
      // After the `PATH` residual it names as the way out, before the run verbs' environment.
      const shim = residuals.indexOf("A `gh` behind a shim.");
      expect(shim).toBeGreaterThan(residuals.indexOf("`PATH` decides which `gh`"));
      expect(shim).toBeLessThan(residuals.indexOf("The run verbs' environment."));
    });

    // ADDED 2026-10-18 (PR #112 round 3, REQ-FLOW-102, REQ-FLOW-104, REQ-FLOW-120): the guard reads a tag write through
    // `git update-ref`, npm's publish prefixes, Corepack and a runner's `@<version>`, refuses the merge queue's
    // enqueue as a merge, and refuses a line nested past four levels (src/hooks/personOnly.ts::personOnlyVerdict);
    // unattended it refuses a gh alias or extension (src/hooks/personOnly.ts::unattendedPushVerdict); it reads every
    // run folder's head under a 2,000-folder ceiling (src/hooks/scripts.ts::buildPersonOnlyGuardScript,
    // src/hooks/scripts.ts::buildUnattendedAskGate); and the run verbs point origin/HEAD at the default branch REST
    // names and refuse an unattended run on the fallback (src/cli/commands/run.ts::alignOriginHead,
    // src/cli/commands/run.ts::runCheckpoint). What stays open is named: the attended gh forms, an update-ref list
    // read from a file, an attended clone no run verb ran in, and the ceiling's refusal.
    it("states round 3's guard readings, the run folder ceiling and the run verbs' default-branch write", () => {
      const guard = section("| The main thread of any session", "| An unattended run, or the text that steers one | Pushing a change");
      const verbs = section("`stamity run start` puts an unattended run", "| Anyone whose text an unattended run sends out");
      const residuals = section("### Cloud and unattended runs", "## Standards mapping");
      for (const claim of [
        "a tag (a `git update-ref` write on `refs/tags/` among them)",
        "a publish (npm's unique prefixes of `publish`, such as `npm pub`, and a manager run through Corepack among them)",
        "wrappers such as `env`, `sudo` and `corepack`",
        "a program word's trailing `@<version>` cut (`npx npm@10`)",
        "an in-progress record in any run folder reads `Mode: unattended`",
        "past 2,000 run folders the read faults, naming `RUN_FOLDERS_OVER_2000`",
        "a `gh` group that is not one of gh's built-in commands (an alias or an extension), `gh alias set` and `gh alias import`",
        // TEST CHANGE, justified (plan 021 file 2, v0a, v0a2 and v0d; REQ-FLOW-102, REQ-FLOW-123, REQ-FLOW-124):
        // attended, an act that can be undone now asks on Claude Code and is refused elsewhere, and only deletions,
        // force pushes and acts that cannot be undone stay refused everywhere, so the page's claim moves with it.
        "The merge queue's GraphQL `enqueuePullRequest` is read as a merge, so it asks or is refused as a merge does",
        "a line nested more than four levels deep is one it cannot read (`NESTING_DEPTH`)",
        "a git, shell or gh alias, a gh extension (the gh forms refused unattended)",
        "a `git update-ref --stdin` text read from a file",
      ]) {
        expect(guard, `the guard's row does not state: ${claim}`).toContain(claim);
      }
      for (const claim of [
        "point that ref at the branch REST names, as `git remote set-head origin -a` would",
        "nothing is written under `--dry-run`",
        "Unattended, they refuse when neither source names the default branch, the `main` and `master` fallback: `run start` exits 1",
        "`run checkpoint` and `run end` refuse the commit before staging",
        "`src/cli/commands/run.ts::alignOriginHead`",
        "is not refused at `run start` on the fallback, and its first `run checkpoint` is",
      ]) {
        expect(verbs, `the run verbs' row does not state: ${claim}`).toContain(claim);
      }
      for (const residual of [
        "So a git, shell or gh alias, a gh extension, a computed",
        "a `git update-ref --stdin` text read from a file and a GraphQL mutation read from a file pass the person-only table's patterns",
        "It refuses a `gh` group that is not one of gh's built-in commands, an alias or an extension, and `gh alias set` and `gh alias import` too",
        "The default branch's name in a clone no run verb ran in.",
        "a push of a default branch with another name passes the person-only rule",
        "closes the gap for every clone a run verb has run in, with one exception",
        // ADDED 2026-10-18 (PR #112 round 4, the pr/71 closure): a default name the push check does not read is left unwritten.
        "they leave the ref unwritten and say so, and the gap stays open in that clone too",
        "The run folder ceiling.",
        "the guard then refuses every call the unattended rule would have refused, attended sessions included",
        "`src/hooks/scripts.ts::buildUnattendedAskGate`",
        "Nested lines are read up to four levels deep: a line nested deeper is one neither verdict can decide",
      ]) {
        expect(residuals, `the cloud section does not name: ${residual}`).toContain(residual);
      }
      // Each new residual sits beside the one it shares a class with.
      expect(residuals.indexOf("The default branch's name in a clone no run verb ran in.")).toBeGreaterThan(residuals.indexOf("Claude Code's working directory."));
      expect(residuals.indexOf("The run folder ceiling.")).toBeGreaterThan(residuals.indexOf("The record head."));
      expect(flat, "SECURITY.md says again that only the newest run folders are read").not.toContain("among the newest run folders");
    });

    // ADDED 2026-10-18 (PR #112 round 4, REQ-FLOW-102, REQ-FLOW-104, REQ-FLOW-120): the guard reads a symbolic-ref
    // write as a tag or a default-branch push to come, judges each curl request after `--next` alone, refuses the
    // GraphQL repository-settings, protection, ruleset and custom-property mutations and the custom-property REST
    // writes as protection, and refuses a call whose method or targets the line hides
    // (src/hooks/personOnly.ts::personOnlyVerdict); Claude Code denies the GitHub MCP server's create_pull_request
    // (src/hooks/personOnly.ts::CLAUDE_DENY_ROWS); a worktree policy never carries the run-ended marker
    // (src/worktree/policy.ts::resolveStrategy, src/worktree/policy.ts::assertRulesAdmissible). What stays open is
    // named: a symbolic ref on disk, a same-line branch switch, the default curl and wget configuration files, and a
    // symlink row sharing the marker.
    it("states round 4's guard readings, the MCP creation row and the marker's worktree rule", () => {
      const guard = section("| The main thread of any session", "| An unattended run, or the text that steers one | Pushing a change");
      const residuals = section("### Cloud and unattended runs", "## Standards mapping");
      for (const claim of [
        "a secret, variable, protection, ruleset or custom-property write",
        "A `git symbolic-ref` write is read too: one naming a tag is refused as a tag, and one pointing a name at the default branch as a push of that branch to come",
        "Each curl request after `--next` (or `-:`) is judged alone, with its own method, body and targets",
        "the branch protection rule, ruleset and custom-property mutations, and a REST write of a custom property's value or definition",
        // TEST CHANGE, justified (plan 021 file 2, v0a, v0a2 and v0d; REQ-FLOW-102, REQ-FLOW-123, REQ-FLOW-124):
        // attended, an act that can be undone now asks on Claude Code and is refused elsewhere, and only deletions,
        // force pushes and acts that cannot be undone stay refused everywhere, so the page's claim moves with it.
        "are read as protection writes, which ask or are refused as the classes above say, their deletions refused everywhere",
        "So is an HTTP call whose method or targets the line hides (`HTTP_TARGET_HIDDEN`)",
        // MOVED 2026-10-18 (PR #112 round 4d, pr/87): the list's last item is now the curl short cluster holding `:`.
        "a curl write whose target curl's globbing would expand (`{` or `[`) unless `-g` or `--globoff` is set, a wget write reading its targets from `-i`",
        "pull-request creation (`create_pull_request`)",
        // TEST CHANGE, justified (plan 021 file 2, v0a2 and v0d; REQ-FLOW-120, REQ-FLOW-123): the MCP pull-request
        // tools now ask, attended, instead of being refused whole, so the shell route the row named for them is gone;
        // the row states the whole-tool class instead.
        "and `delete_file`, a commit rather than a ref deletion, asks",
        "a symbolic ref already on disk, a branch switch earlier on the line before a push whose destination is implied, a method, body or URL from curl's or wget's default configuration file",
      ]) {
        expect(guard, `the guard's row does not state: ${claim}`).toContain(claim);
      }
      for (const residual of [
        "pull-request-creating, pull-request-update and repository-delete tools by name",
        "A symbolic ref already on disk.",
        "`git push origin <name>` then sends the branch the ref points at, and the guard compares only the literal name",
        "A branch switch before an implied push on the same line.",
        "`git symbolic-ref HEAD refs/heads/main && git push`",
        "curl's and wget's default configuration files.",
        "curl's `.curlrc` (found through `CURL_HOME` or `XDG_CONFIG_HOME`, and skipped when `-q` is the first option)",
        "the file `WGETRC` names",
        "A worktree policy never carries the marker into another checkout",
        "A `symlink` row on `.stamity` still shares it live",
        "`src/worktree/policy.ts::resolveStrategy`",
      ]) {
        expect(residuals, `the cloud section does not name: ${residual}`).toContain(residual);
      }
      // Each new residual names the control that holds, and sits beside the attended default-branch gap.
      for (const [start, end] of [
        ["A symbolic ref already on disk.", "A branch switch before an implied push on the same line."],
        ["A branch switch before an implied push on the same line.", "curl's and wget's default configuration files."],
        ["curl's and wget's default configuration files.", "Respelling."],
      ] as const) {
        const body = residuals.slice(residuals.indexOf(start), residuals.indexOf(end));
        expect(body, `${start} names no control`).toContain("only the remote's own protection stands in front of");
        expect(body.length, `${start} is out of order`).toBeGreaterThan(start.length);
      }
      expect(residuals.indexOf("A symbolic ref already on disk.")).toBeGreaterThan(residuals.indexOf("The default branch's name in a clone no run verb ran in."));
    });

    // ADDED 2026-10-18 (PR #112 round 4b, REQ-FLOW-102, REQ-FLOW-104, REQ-FLOW-120): curl's body counts in every
    // spelling, `git update-ref --stdin`'s symref commands on the line are read as `git symbolic-ref` is, and a method
    // the line cannot show is a hidden call (src/hooks/personOnly.ts::personOnlyVerdict); a REST target held in a
    // variable is the named respelling, attended and unattended.
    it("states round 4b's guard readings and the variable-target respelling", () => {
      const guard = section("| The main thread of any session", "| An unattended run, or the text that steers one | Pushing a change");
      const residuals = section("### Cloud and unattended runs", "## Standards mapping");
      for (const claim of [
        "so are the symref commands of a `git update-ref --stdin` text the line carries (`symref-create`, `symref-update`, `symref-delete`), read as `git symbolic-ref` is",
        "a curl body counts as one in every spelling: apart, attached (`-d@<file>`, `-d'{…}'`, `-F<field>`, `-T<path>`) or as a short cluster's first value letter (`-sd@<file>`)",
        "(`HTTP_TARGET_HIDDEN`): a method held in a variable or a substitution (`-X \"$M\"`, `--request \"$(…)\"`, wget's `--method` or a wgetrc `method=`)",
        "a REST target held in a variable, which the guard judges as the literal word",
      ]) {
        expect(guard, `the guard's row does not state: ${claim}`).toContain(claim);
      }
      for (const residual of [
        "a REST target held in a variable (the call is judged on the literal word, so a computed URL passes, where a method held in one is refused as a hidden call, `HTTP_TARGET_HIDDEN`)",
        "a script the run writes and then runs, a REST target held in a variable, and a GraphQL mutation read from a file",
      ]) {
        expect(residuals, `the cloud section does not name: ${residual}`).toContain(residual);
      }
    });

    // ADDED 2026-10-18 (PR #112 round 4d, REQ-FLOW-102, REQ-FLOW-104, REQ-FLOW-120): a symref command is read wherever
    // it stands in the text, a short cluster's method whatever it holds (gh's `-i` cluster and `-X=` among them), and
    // curl's long options from a unique prefix (src/hooks/personOnly.ts::personOnlyVerdict); the hidden-call list names
    // the curl cluster holding `:`; a symref command word the line cannot show is a named respelling; and the default
    // configuration files' unattended control holds the default branch alone.
    it("states round 4d's guard readings, the symref-word respelling and the configuration files' control", () => {
      const guard = section("| The main thread of any session", "| An unattended run, or the text that steers one | Pushing a change");
      const residuals = section("### Cloud and unattended runs", "## Standards mapping");
      for (const claim of [
        "read as `git symbolic-ref` is, each wherever it stands in the text, a second one after an escaped line break (`\\n`, `\\0`) among them",
        "and so does a curl method (`-XDELETE`, `-sX$M`), a letter after another value letter being that letter's value (`-oX` names a file)",
        // TEST CHANGE, justified (plan 021 file 2, v0d; pr/91): the code reads any prefix of two or more letters of a
        // listed long option (src/hooks/personOnly.ts, httpCall's LONG), not a unique one, and real curl refuses
        // `--dat` as ambiguous, so the page states what the code does.
        "A curl or wget long option counts from any prefix of two or more letters of a long option the guard lists, read as the first listed option it begins (`--req`, `--me`)",
        "gh's `-i` clustered with a method or a field (`-iXDELETE`) and its `-X=<method>` count as gh reads them",
        "attached in a short cluster too (`-sX$M`, gh's `-iX$M`), or cut from the line by an unquoted one",
        "a wget write reading its targets from `-i`, and a curl short cluster holding `:` among other letters, which starts a request where the line does not show",
        "a `git update-ref --stdin` text read from a file or a symref command word the line cannot show",
      ]) {
        expect(guard, `the guard's row does not state: ${claim}`).toContain(claim);
      }
      for (const residual of [
        "a symref command word the line cannot show (`symref-%s` with the command as printf's argument, or a variable holding it)",
        "the pre-flight's refusal of an account that can push to the default branch holds that branch alone: a write such a file hides reaches the run's own branch around the run verbs, the held paths and the last scan, as the other respellings do",
      ]) {
        expect(residuals, `the cloud section does not name: ${residual}`).toContain(residual);
      }
      expect(residuals, "the configuration files' residual names the pre-flight's wall as the unattended control again").not.toContain(
        "such a call meets the protection the pre-flight proved there",
      );
    });

    // ADDED 2026-10-18 (PR #112 round 5, REQ-FLOW-102, REQ-FLOW-104, REQ-FLOW-120): both verdicts read a REST path
    // with its dot segments resolved as well as written, `gh repo sync` onto a named repository is a force push or a
    // push of the default branch, and `gh repo unarchive` a repository write (src/hooks/personOnly.ts::personOnlyVerdict,
    // src/hooks/personOnly.ts::unattendedPushVerdict); past the tag ceilings the guard refuses a refspec push, naming
    // the code, as past the run folder one (src/hooks/scripts.ts::buildPersonOnlyGuardScript).
    it("states round 5's guard readings and the tag ceiling beside the run folder one", () => {
      const guard = section("| The main thread of any session", "| An unattended run, or the text that steers one | Pushing a change");
      const residuals = section("### Cloud and unattended runs", "## Standards mapping");
      for (const claim of [
        "Both verdicts read a REST path with its dot segments resolved (`.` and `..`, as curl resolves them before sending) as well as written, so a protected route reached through one is refused as that route",
        "`gh repo sync` naming a destination repository is read as a push to it: under `--force` a force push, and with no `--branch`, a default branch or a branch the line cannot show a push of the default branch",
        "while a sync of the local checkout, with no repository named, writes nothing remote and passes when attended",
        "and so is `gh repo unarchive`, as `gh repo archive` is",
        "past 10,000 tag names the read faults, naming `TAG_NAMES_OVER_10000`, and past an 8 MiB `packed-refs` file, naming `PACKED_REFS_OVER_8388608`",
      ]) {
        expect(guard, `the guard's row does not state: ${claim}`).toContain(claim);
      }
      for (const residual of [
        "The tag ceiling.",
        "the guard then refuses every push that names a refspec in that repository, attended sessions included, rather than read a cut-off list as whole",
        "a path with dot segments is read resolved as well as written, so it is refused as the route curl sends it to",
      ]) {
        expect(residuals, `the cloud section does not name: ${residual}`).toContain(residual);
      }
      // Beside the run folder ceiling it follows.
      expect(residuals.indexOf("The tag ceiling.")).toBeGreaterThan(residuals.indexOf("The run folder ceiling."));
      expect(residuals.indexOf("The tag ceiling.")).toBeLessThan(residuals.indexOf("The final round's window."));
    });

    // ADDED 2026-10-19 (plan 021 file 2, unit v0d-guard-pages; REQ-FLOW-104, REQ-FLOW-121 to REQ-FLOW-124, REQ-CTX-013):
    // the page states each client's answer to a person-only act with its measurement or source, the refuse class, the
    // run verb's stand-alone line and the verbs' git environment, the startup card, and the residuals REQ-FLOW-104
    // names: an ask holds only while a client honours it, a respelling no settings row names, a `GIT_CONFIG_*` variable
    // gained after the pre-flight, the unreleased build's deny rows, the readiness hook's install scripts and the
    // stand-alone rule's text reading (review/97).
    it("states file 2's ask rule, each client's answer, the run verb's line and the residuals REQ-FLOW-104 names", () => {
      const guard = section("| The main thread of any session", "| An unattended run, or the text that steers one | Pushing a change");
      const residuals = section("### Cloud and unattended runs", "## Standards mapping");
      for (const claim of [
        "A deletion, a force push or an act that cannot be undone is refused on every client, attended or not",
        "Attended, an act that can be undone asks on Claude Code for one click, the hook's `ask` answer, and the agent runs it on yes",
        "it is refused instead where a sub-agent runs it (any agent identity the payload names), since the act is the person's, and in Claude Code's `auto` permission mode",
        // TEST CHANGE, justified (plan 021 file 2, units w4-copilot-ask and w5-ask-pages; REQ-FLOW-123): Copilot CLI
        // now asks for the person's own agent (src/hooks/scripts.ts, attendedAsk's Copilot copy), so the row's two
        // phrases saying it refuses for want of a calling agent move to the sentences stating the ask; the case below,
        // "states Copilot CLI's ask for the person's own agent", pins the rest and that the old phrase is gone.
        "Copilot CLI asks too, for the person's own agent alone",
        "Measured on Copilot CLI 1.0.98 on 2026-10-19: the interactive client shows its hook permission dialog and waits for the person, a headless run and autopilot deny an ask",
        "Cursor 2026.10.14 ran the command despite a `beforeShellExecution` ask under `--force` (measured 2026-10-18)",
        "Codex's hooks page says an ask is parsed and not honoured",
        "so one refuse-class act refuses the whole call and a deletion never rides an approval",
        "is refused, never asked about",
        "`gh extension exec`",
        "`GIT_EXEC_PATH` and seven more, `SSH_ASKPASS` among them",
        "unless the verb stands alone on it as one simple command",
        "a `packed-refs` file or a loose tag entry that is not a regular file (a link, a FIFO) is read as absent",
        "the ask-class ones are `permissions.ask` rows",
        "a `git/refs` `PATCH`, refused as a forced ref update",
        "An attended ask holds only while the client honours it",
      ]) {
        expect(guard, `the guard's row does not state: ${claim}`).toContain(claim);
      }
      for (const residual of [
        "How each client answers an ask.",
        "Claude Code 2.1.302 holds a hook's `ask` in bypass-permissions mode (measured on 2026-10-18 in throwaway folders; its documentation does not state it)",
        "That reading is re-measured before each release with `node scripts/qa/hook-runs.mjs --ask`",
        "Where no hook runs.",
        "a respelling no row names costs one click there",
        "since a row ending in ` :*` after a `*` matched nothing in the same measurement",
        // TEST CHANGE, justified (plan 022 file 1, unit a16-security-pages; REQ-FLOW-131, REQ-FLOW-104): the run verbs
        // compare git's surface with the pre-flight's record at their start and before the push
        // (src/runs/gitSurface.ts::checkSurfaceRecord), so such a variable reaches their git only as far as that compare.
        "set on an earlier line of a shell that persists or by a line of Claude Code's environment file, reaches their git only as far as that compare, which refuses it",
        // TEST CHANGE, justified (plan 022 file 1, unit a16-security-pages, fix round 1, review/162; REQ-FLOW-131): a
        // record head rewritten to `Mode: attended` reads as attended to the three verbs, which then skip the compare and
        // the record (src/cli/commands/runLand.ts, `readsUnattended` and `surfaceMoved`), so a fourth gap joins the three.
        "Four gaps remain. A steered agent can run the pre-flight again, which vets the new surface, or forge the record, which it can write. A change made after the second read",
        "a run that rewrites its record head to `Mode: attended` reads as attended to all three verbs, so they skip the compare and the pre-flight record, and the land verb's own refusal of `--approved` lifts",
        "The stand-alone rule for a run verb's line finds the verb by its name in the line's text, so a launcher the guard does not unwrap, a name split by quotes or a line built by an expression can skip it",
        "Claude Code's cloud readiness hook.",
        "`npm ci` runs the locked dependencies' install scripts, and they inherit `CLAUDE_ENV_FILE`, so one can append lines that run before every later shell command",
        "`src/hooks/scripts.ts::buildCloudReadinessScript`",
        "`SSH_ASKPASS`, which git runs when no askpass helper answers",
        "a deletion, a force push or an act that cannot be undone stays refused on every client, with a click or without one",
      ]) {
        expect(residuals, `the cloud section does not name: ${residual}`).toContain(residual);
      }
      const verbsGit = section("| Any repository writer, a pull request included | Committing a folder in the shape", "| Any repository writer, a pull request included | Committing a file under git's program name");
      expect(verbsGit).toContain("In an unattended run it also leaves out git's program-valued variables");
      expect(verbsGit).toContain("sets `GIT_ASKPASS` to the empty string, so no askpass program runs");
      expect(verbsGit).toContain("lists them in its JSON's `gitEnvRemoved`, never a value");
      const settings = section("Any tool or person editing a client config the engine also writes", "| A pull request author |");
      expect(settings).toContain("those acts stay refused there until the person removes the rows, which `clean` names");
      for (const stale of [
        "refuses a person-only act on every client, attended or not",
        "a `stamity run` line among them, since the run verbs' git keeps the caller's environment",
        "whose local tags it cannot read whole",
      ]) {
        expect(flat, `SECURITY.md says again: ${stale}`).not.toContain(stale);
      }
    });

    // ADDED 2026-10-19 (plan 021 file 2, unit w3-pages; REQ-FLOW-121): v0b's fix of review/130 finds a run verb after
    // `run`'s option words, in each parsed command's decoded words too, reads a first word after `run` it cannot settle
    // as an option word, and refuses a verb written after option words with its own reason
    // (src/hooks/personOnly.ts::unattendedPushVerdict). The guard's row states that reading after the pinned
    // stand-alone phrase, which stays word for word.
    it("states where the stand-alone rule finds a run verb, and the refusal of one after option words", () => {
      const guard = section("| The main thread of any session", "| An unattended run, or the text that steers one | Pushing a change");
      const pinned = "unless the verb stands alone on it as one simple command";
      expect(guard, `the guard's row does not state: ${pinned}`).toContain(pinned);
      const claims = [
        "The verb is found anywhere after `run`'s option words and their values, in each parsed command and in each parsed command's decoded words, joined, beside the package",
        // TEST CHANGE, justified (plan 021 file 2, unit w5-ask-pages, ledger row review/146): the unsure first word
        // opens the option words, but the code still needs a verb word after it (src/hooks/personOnly.ts,
        // namesVerbInWords), so `stamity run $V` passes; the row said an unsure line reads as running a verb.
        "a first word after `run` that the reading cannot settle (an expansion, a glob, a brace or a splat) counts as an option word, so a verb written after it is still found",
        "a verb written after option words is refused with its own reason, words between `run` and its verb",
      ];
      for (const claim of claims) {
        expect(guard, `the guard's row does not state: ${claim}`).toContain(claim);
        // The reading qualifies the stand-alone shape, so it follows the pinned phrase.
        expect(guard.indexOf(claim), `the guard's row states "${claim.slice(0, 40)}…" before the shape`).toBeGreaterThan(
          guard.indexOf(pinned),
        );
      }
      expect(guard, "the guard's row says again that an unsure line reads as running a verb").not.toContain(
        "so an unsure line is read as running a verb",
      );
    });

    // ADDED 2026-10-19 (plan 021 file 2, units w4-copilot-ask and w5-ask-pages; REQ-FLOW-123, REQ-FLOW-102): Copilot
    // CLI asks for the person's own agent alone, a call with no helper field whose session id its session start
    // recorded (src/hooks/scripts.ts::buildPersonOnlyGuardScript, attendedAsk's Copilot copy; the record's writer in
    // src/hooks/scripts.ts::buildSessionStartScript), measured on 1.0.98 (reports/w4-measure-r1.md); Cursor and Codex
    // keep refusing, each for the reasons the walk's research read on 2026-10-19.
    it("states Copilot CLI's ask for the person's own agent, its residuals, and why Cursor and Codex keep refusing", () => {
      const guard = section("| The main thread of any session", "| An unattended run, or the text that steers one | Pushing a change");
      const residuals = section("### Cloud and unattended runs", "## Standards mapping");
      for (const claim of [
        "Copilot CLI asks too, for the person's own agent alone: the call's payload must carry none of the ten helper fields the guard reads (`agentId`, `agentType` and `parentAgentId`, the three a Copilot helper's call carries, among them)",
        "its session id must be a whole line of the record Copilot's session start keeps, `stamity/copilot-main-sessions` under the repository's common git directory, outside the working tree",
        "every call where that record is missing, unreadable, past 64 KiB or malformed, is refused, the reason saying the call could not be shown to come from the person's own agent",
        "a helper's tool call carries `agentId`, `agentType` and `parentAgentId` and a session id of its own, and the session start fires for the main agent alone",
        "Cursor and Codex refuse it, the reason telling the agent to give the person the exact command",
        "its staff say an ask on a shell hook is enforced on no path, its hooks page says `preToolUse`'s ask is not enforced, and a hook cannot see its run mode (read 2026-10-19)",
        "a helper's hook shares its parent's session id, and an auto-review agent can settle a rules prompt (read 2026-10-19)",
        "An attended ask holds only while the client honours it, and Copilot CLI's experimental assisted mode hands it to an LLM judge",
      ]) {
        expect(guard, `the guard's row does not state: ${claim}`).toContain(claim);
      }
      expect(guard, "the guard's row says again that Copilot's payload names no calling agent").not.toContain("names no calling agent");
      expect(guard, "the guard's row says again that Copilot CLI refuses").not.toContain("Copilot CLI, Cursor and Codex refuse");
      for (const residual of [
        "asks for one click on a person-only act that can be undone on Claude Code, and on Copilot CLI for the person's own agent, and refuses it on Cursor and Codex",
        "so an unmeasured Claude Code or Copilot CLI holds the tag",
        "Copilot CLI 1.0.98 holds the guard's ask the same way (measured on 2026-10-19 in throwaway folders)",
        "its one-minute check is an interactive Copilot CLI session with Allow All on, in a throwaway folder set up for Copilot",
        "Its experimental assisted mode (`/allow-all auto`, `--assisted-approval`) sends a hook's ask to an LLM judge that may approve it without the person, and a hook cannot see that mode",
        "a line written there by anything else, a steered agent included, reads as a main session's id",
        "Cursor and Codex refuse every ask-class act, for the reasons the guard's row above gives",
      ]) {
        expect(residuals, `the cloud section does not name: ${residual}`).toContain(residual);
      }
      expect(residuals, "the cloud section says again that Copilot CLI refuses every ask-class act").not.toContain(
        "Copilot CLI, Cursor and Codex refuse every ask-class act",
      );
    });

    // ADDED 2026-10-19 (plan 021 file 2, units w1-checkpoint-hook-paths and w5-ask-pages; REQ-FLOW-093, REQ-FLOW-102,
    // ledger rows pr/1, review/136 to review/139, review/142, review/143 and review/149): the run verbs read their own
    // commit's paths after the repository's hooks ran and undo a widened commit by a compare-and-swap, and a checkpoint
    // marker holds an unchecked commit (src/cli/commands/run.ts::hookWidened, src/cli/commands/run.ts::undoCommit,
    // src/cli/commands/run.ts::markerPath). The hooks residual keeps its pinned phrases and names the marker's two
    // residuals: its removal is a person's act in text only, and it belongs to one work tree.
    it("states the run verbs' check of a hook-widened commit and the checkpoint marker's two residuals", () => {
      const residuals = section("### Cloud and unattended runs", "## Standards mapping");
      const hooks = residuals.slice(residuals.indexOf("Hooks the run writes."), residuals.indexOf("The environment."));
      for (const claim of [
        "The run verbs keep the repository's hooks",
        "a hook a run writes runs when `run checkpoint` or `run end` commits or pushes",
        "The control that holds is the pre-flight's refusal of an account that can push to the default branch",
        "A hook cannot widen a run verb's own commit, attended or not",
        "needs `HEAD^` to be that commit and every path the commit changes to be one the verb itself staged",
        "rewinds the run branch by name to the `HEAD` it read, a compare-and-swap with `git update-ref` that refuses where `HEAD` has left the branch",
        "`stamity/checkpoint-pending` under the work tree's own git directory",
        "every later `run checkpoint` and `run end` refuses, committing and pushing nothing, until a person resolves it",
        "`src/cli/commands/run.ts::hookWidened`",
        "Its removal is a person's act in text only",
        "a run or a hook that deletes it gets the next checkpoint to push the unchecked commit",
        "it belongs to one work tree",
        "Commits made outside the run verbs push as before.",
      ]) {
        expect(hooks, `the hooks residual does not state: ${claim}`).toContain(claim);
      }
    });
  });

  it("covers the four surfaces the phase claims, and the limits", () => {
    expect(text).toMatch(/trust ladder/i);
    expect(text).toMatch(/deny-scan/i);
    expect(text).toMatch(/allowlist/i);
    expect(text).toMatch(/atomic rename/i);
    expect(text).toMatch(/does not defend/i);
  });

  // ADDED 2026-10-14 (plan 020 file 1, unit d4-docs-site, REQ-PLUGIN-047): the plugin route's
  // controls leave the code with the route — `checkPluginRuntime` and `compatibilityOf` with the
  // `plugin-runtime` row and `plugin status`, `--expect-mode` with the install mode — so neither
  // security page may go on citing one as a control the engine runs.
  it.each([SECURITY, SECURITY_MAPPING])("%s cites none of the deleted plugin route's controls", (page) => {
    const body = read(page);
    expect(body.length, `${page} read as empty`).toBeGreaterThan(500);
    for (const token of ["checkPluginRuntime", "compatibilityOf", "--expect-mode", "plugin setup", "apm-route"]) {
      expect(body, `${page} still cites \`${token}\``).not.toContain(token);
    }
  });
});

// ADDED 2026-10-19 (plan 021 file 2, unit w3-pages; REQ-FLOW-091, REQ-FLOW-121): the spec states the landed
// behaviour of w2 (the stale reasons `spelling`, `link` and `untracked`, each with its own message, and an empty
// `reads:` list that blocks; src/runs/freshness.ts, src/runs/planCheck.ts) and of v0b's fix of review/130 and /131
// (src/hooks/personOnly.ts::unattendedPushVerdict), each as an `Amended 2026-10-19` bullet before its requirement's
// Proof line.
describe("docs/specs/everyday-flows.md, amended for w2 and v0b's fix", () => {
  const SPEC = "docs/specs/everyday-flows.md";
  const spec = read(SPEC);
  /** One requirement's flowed text, from its heading to the next requirement's. */
  const requirement = (id: string): string => {
    const from = spec.indexOf(`### ${id} `);
    expect(from, `${SPEC} has no ${id} heading`).toBeGreaterThanOrEqual(0);
    const to = spec.indexOf("\n### REQ-", from + 1);
    return flowed(spec.slice(from, to === -1 ? undefined : to));
  };
  /** The flowed `Amended 2026-10-19` bullet of one requirement, which must sit before its Proof line. */
  const amendment = (id: string): string => {
    const text = requirement(id);
    const from = text.indexOf("- **Amended 2026-10-19**");
    expect(from, `${id} has no "Amended 2026-10-19" bullet`).toBeGreaterThanOrEqual(0);
    const proof = text.indexOf("- **Proof:**", from);
    expect(proof, `${id}'s 2026-10-19 bullet does not come before its Proof line`).toBeGreaterThan(from);
    return text.slice(from, proof);
  };

  it("states w2's stale reasons, their messages and the empty reads list on REQ-FLOW-091", () => {
    const bullet = amendment("REQ-FLOW-091");
    for (const claim of [
      "unit `w2-plan-reads`",
      "stale `spelling`",
      "stale `link`",
      "stale `untracked`",
      "before any history count, and no chain base exempts them",
      "is not a plain repository path; write it as git lists it and re-stamp the plan.",
      "is a symbolic link, lies under one, or is a folder holding one at HEAD; list the files the plan read instead, and re-stamp the plan.",
      "is not tracked by git at HEAD, so its history cannot be measured; commit it or drop it from reads, and re-stamp the plan.",
      "A head `reads: []` is `head-key-missing` at the `reads:` line: \"The head's `reads` must list at least one path.\"",
      "`freshness([])`, the engine's call, is unchanged",
    ]) {
      expect(bullet, `REQ-FLOW-091's 2026-10-19 bullet does not state: ${claim}`).toContain(claim);
    }
  });

  it("states v0b's reading of a run verb after run's option words on REQ-FLOW-121", () => {
    const bullet = amendment("REQ-FLOW-121");
    for (const claim of [
      "unit `v0b-run-verb-alone`",
      "the verb is any word after `run`'s option words and their values",
      "each parsed command's decoded words, joined, beside the package",
      "a first word after `run` that the reading cannot settle (an expansion, a glob, a brace or a splat) counts as an option word",
      // TEST CHANGE, justified (plan 021 file 2, unit w5-ask-pages, ledger rows review/146 and review/147): the unsure
      // word still needs a verb word after it (src/hooks/personOnly.ts, namesVerbInWords), and PowerShell's shape
      // refuses an unquoted `@` only in a word after `run` (verbShape's `ats` read past `run`'s index), so npx's
      // `--@<scope>:registry=<url>` and `<pkg>@<semver>` words pass; the bullet said "after the program".
      "counts as an option word, so a verb written after it is still found",
      "refused with its own reason, words between `run` and its verb",
      "a blank other than a space or a tab",
      "an unquoted `@` in a word after `run`, which PowerShell reads as a splat",
      "the stop-parsing `--%` spelled with typographic dashes",
    ]) {
      expect(bullet, `REQ-FLOW-121's 2026-10-19 bullet does not state: ${claim}`).toContain(claim);
    }
    for (const stale of ["so an unsure line is read as running a verb", "an unquoted `@` after the program"]) {
      expect(bullet, `REQ-FLOW-121's 2026-10-19 bullet says again: ${stale}`).not.toContain(stale);
    }
  });

  // ADDED 2026-10-19 (plan 021 file 2, unit w5-ask-pages, for w1-checkpoint-hook-paths and its two fix rounds;
  // REQ-FLOW-092, REQ-FLOW-093): the verb's check of its own commit after the repository's hooks, the compare-and-swap
  // undo and the checkpoint marker (src/cli/commands/run.ts: hookWidened, undoCommit, markerPath, markerRefusal), and
  // the marker's exception to the draft pull request at every exit.
  it("states w1's check of a hook-widened commit and the checkpoint marker on REQ-FLOW-093", () => {
    const bullet = amendment("REQ-FLOW-093");
    for (const claim of [
      "unit `w1-checkpoint-hook-paths`",
      "the verb reads `HEAD` before the commit and, after it, needs `HEAD^` to be that commit",
      "`git update-ref refs/heads/<run-branch> <before> <the commit it checked>`",
      "refusing where `HEAD` has left that branch",
      "`commit refused: <path> was staged by a hook and is not in --paths (commit undone)`",
      "`commit refused: a hook made a commit of its own (commit undone)`",
      "exits 1 before the scan and the push. Attended and unattended alike",
      "`stamity/checkpoint-pending` exclusively under the work tree's own git directory",
      "`commit not undone: …; HEAD holds <sha>, reset target <before>`",
      "every later `run checkpoint` and `run end` refuses, a call with nothing staged included",
      "\"with nothing staged commits nothing and pushes only when the branch is ahead\" holds only with no marker",
      "Commits made outside the run verbs push as before",
    ]) {
      expect(bullet, `REQ-FLOW-093's 2026-10-19 bullet does not state: ${claim}`).toContain(claim);
    }
  });

  it("states the checkpoint marker's exception to the draft pull request on REQ-FLOW-092", () => {
    const bullet = amendment("REQ-FLOW-092");
    for (const claim of [
      "Given a checkpoint marker left in the work tree's git directory (REQ-FLOW-093)",
      "`run end` refuses before its commit, its scan, its push and its pull-request step, so that exit opens or updates no draft pull request",
      "never removes the marker or resets the run branch",
    ]) {
      expect(bullet, `REQ-FLOW-092's 2026-10-19 bullet does not state: ${claim}`).toContain(claim);
    }
  });

  // ADDED 2026-10-19 (plan 021 file 2, units w1-checkpoint-hook-paths, w4-copilot-ask and w5-ask-pages; REQ-FLOW-102):
  // the verbs' one rewind, of their own unpushed commit, and the helper fields every client now reads
  // (src/hooks/scripts.ts, GUARD_HELPER_FIELDS).
  it("states the verbs' one rewind and the wider helper fields on REQ-FLOW-102", () => {
    const bullet = amendment("REQ-FLOW-102");
    for (const claim of [
      "the one rewind they make is of their own commit, unpushed, that a pre-commit hook widened",
      "a compare-and-swap (`git update-ref`), never whatever `HEAD` then names",
      "`agentId`, `parentAgentId`, `parent_agent_id` and `parent_tool_call_id`",
      "on Copilot CLI the field's presence alone",
    ]) {
      expect(bullet, `REQ-FLOW-102's 2026-10-19 bullet does not state: ${claim}`).toContain(claim);
    }
  });

  // ADDED 2026-10-19 (plan 021 file 2, units w4-copilot-ask and w5-ask-pages; REQ-FLOW-123): Copilot CLI's ask for its
  // main agent (src/hooks/scripts.ts: attendedAsk, GUARD_NO_CALLER, the session start's record), the facts measured on
  // 1.0.98 (reports/w4-measure-r1.md), its residuals, and Cursor's and Codex's reasons for refusing.
  it("states Copilot CLI's ask, its facts and residuals, and Cursor's and Codex's refusals on REQ-FLOW-123", () => {
    const bullet = amendment("REQ-FLOW-123");
    for (const claim of [
      "units `w4-copilot-ask` and `w5-ask-pages`",
      "the guard answers `permissionDecision: \"ask\"` with the act's reason when the payload carries none of the ten helper fields",
      "a whole line of `stamity/copilot-main-sessions` under the repository's common git directory",
      "created owner-only and kept to its last 200 lines",
      "\"Copilot CLI could not show that this call comes from the person's own agent (a helper agent's call, or a session its session start did not record), so the guard refuses it: give the person the exact command.\"",
      "Claude Code's answers keep their bytes; Cursor and Codex keep `deny` with `GUARD_CANNOT_ASK`",
      "the release re-measurement's ask-class clients are Claude Code and Copilot CLI",
      "measured on Copilot CLI 1.0.98 on 2026-10-19",
      "headless runs and autopilot deny an ask; the interactive client shows its hook permission dialog and waits",
      "Copilot's experimental assisted mode (`/allow-all auto`, `--assisted-approval`) sends the ask to an LLM judge",
      "Cursor keeps refusing: its staff say an ask on a shell hook is enforced on no path",
      "Codex keeps refusing: its hooks page says an ask fails open, a helper's hook shares the parent's session id",
    ]) {
      expect(bullet, `REQ-FLOW-123's 2026-10-19 bullet does not state: ${claim}`).toContain(claim);
    }
  });
});

// ADDED 2026-10-19 (plan 021 file 2, unit w5-ask-pages; REQ-PROVE-042, REQ-PROVE-043): the proof spec's cadence and
// cloud-page requirements name Copilot CLI's ask beside Claude Code's, as `ASK_CLASS_CLIENTS` in
// scripts/qa/hook-runs.mjs and the release checklist now do.
describe("docs/specs/prove-behavior-and-value.md, amended for Copilot CLI's ask", () => {
  const spec = flowed(read("docs/specs/prove-behavior-and-value.md"));
  const requirement = (id: string): string => {
    const from = spec.indexOf(`### ${id} `);
    expect(from, `the proof spec has no ${id} heading`).toBeGreaterThanOrEqual(0);
    return spec.slice(from, spec.indexOf("### REQ-", from + 1));
  };

  it("names Claude Code and Copilot CLI as the ask-class clients on REQ-PROVE-042", () => {
    const text = requirement("REQ-PROVE-042");
    expect(text).toContain("and Claude Code and Copilot CLI as the ask-class clients it measures");
    expect(text).toContain("until a run on a machine with both clients reads `held` or `ran` for each");
    expect(text).toContain("in an interactive Copilot CLI session with Allow All on, in a throwaway folder set up for Copilot");
  });

  it("states Copilot CLI's ask on the cloud page's requirement, REQ-PROVE-043", () => {
    const text = requirement("REQ-PROVE-043");
    expect(text).toContain("Claude Code asks for one click, and Copilot CLI for the person's own agent alone");
    expect(text).toContain("Cursor and Codex refuse");
  });
});

// ADDED 2026-10-19 (plan 021 file 2, unit n6-night-pages; REQ-FLOW-092, REQ-FLOW-093, REQ-FLOW-102, REQ-FLOW-123,
// REQ-PROVE-042): the pages state what the night units landed, read from the code at the integration head. n2: the
// checkpoint marker is read before anything is staged, and a commit whose process group the wall time stopped and saw
// gone, with no index lock and HEAD unmoved, clears it (src/cli/commands/run.ts, groupGone and the commit's catch;
// src/cli/engine/gitWrite.ts, gitWriteInGroup), a hook's child that leaves the group the named residual; a `--paths`
// entry naming a committed path is harmless (namedPaths, committedDeletions). n4: `.claude/hooks/**` is held
// (PERSON_ONLY_PATHS), and, pass 2, with n4's fix and cap rounds at cee46ac1, `.stamity/packs/**`, the hooks folder
// Base:'s manifest names and each script and repository-path launcher a hook declaration at Base: names, the hold
// refusing on what it cannot resolve cleanly there (run.ts, hookPathsAt and baseReader), with three named residuals.
// n5: Copilot's session start updates its record under a lock (COPILOT_RECORD_SOURCE), build/92 the residual. n3: the
// release re-measure's three facts and the checklist's moved ranges. The pages say "at the time it was read", never
// "provably".
describe("the night units' pages (n2, n3, n4, n5)", () => {
  const security = flowed(read(SECURITY));
  const between = (text: string, start: string, end: string): string => {
    const from = text.indexOf(start);
    const to = text.indexOf(end, from + start.length);
    expect(from, `no "${start}"`).toBeGreaterThanOrEqual(0);
    expect(to, `no "${end}" after "${start}"`).toBeGreaterThan(from);
    return text.slice(from, to);
  };
  const SPEC = "docs/specs/everyday-flows.md";
  const spec = read(SPEC);
  /** The flowed `Amended 2026-10-19` bullet this unit wrote on one requirement, before its Proof line. */
  const nightBullet = (id: string): string => {
    const from = spec.indexOf(`### ${id} `);
    expect(from, `${SPEC} has no ${id} heading`).toBeGreaterThanOrEqual(0);
    const to = spec.indexOf("\n### REQ-", from + 1);
    const text = flowed(spec.slice(from, to === -1 ? undefined : to));
    const mark = text.indexOf("written by `n6-night-pages`");
    expect(mark, `${id} has no bullet written by n6-night-pages`).toBeGreaterThanOrEqual(0);
    const start = text.lastIndexOf("- **Amended 2026-10-19**", mark);
    const proof = text.indexOf("- **Proof:**", mark);
    expect(start, `${id}'s n6 bullet does not open as an Amended 2026-10-19 bullet`).toBeGreaterThanOrEqual(0);
    expect(proof, `${id}'s n6 bullet does not come before its Proof line`).toBeGreaterThan(mark);
    return text.slice(start, proof);
  };

  it("states on SECURITY.md that the marker is read before anything is staged, when it clears, and the hook residual", () => {
    const hooks = between(security, "Hooks the run writes.", "The environment.");
    for (const claim of [
      "The verb reads the marker before it stages anything, writes a held patch or restores the index, so a refusal leaves them as the unchecked commit did.",
      "Off Windows the commit's git runs in a process group of its own, which the wall time stops, a stop and, where the group outlives a grace, a kill, and waits for",
      "where that group is gone, git's `index.lock` is absent and `HEAD` still names, on the run branch, the commit read before, each at the time it was read, no commit landed, so the verb removes the marker and reports `commit not made`",
      "Every other stop keeps it: on Windows, an output past the runner's buffer cap, a stop by a signal the runner did not send, and an interrupt that stops the verb but not git's group, which runs on with no wall time.",
      "Three residuals stay with the marker.",
      "A hook that detaches its own child, or starts its own process group, leaves the group the verb stops, so that child can still land a commit after the clear, and the next checkpoint pushes it without the check of a hook-widened commit; an unattended run's held paths and the secret scan still read that push.",
    ]) {
      expect(hooks, `the hooks residual does not state: ${claim}`).toContain(claim);
    }
    expect(hooks, "the hooks residual says again that two residuals stay").not.toContain("Two residuals stay with the marker.");
    expect(hooks, "the page says provably, not at the time it was read").not.toMatch(/provabl/i);
  });

  it("holds Claude Code's hook scripts on SECURITY.md and the mapping page", () => {
    const verbs = between(security, "`stamity run start` puts an unattended run", "| Anyone whose text an unattended run sends out");
    expect(verbs).toContain("hook and guard configuration with the scripts Claude Code's and Cursor's hooks run under `.claude/hooks/` and `.cursor/hooks/`");
    expect(flowed(read(SECURITY_MAPPING))).toContain(
      "move the change under the person-only paths, Claude Code's and Cursor's hook scripts under `.claude/hooks/` and `.cursor/hooks/` among them, and a symbolic link at a held glob's folder, into an inert patch",
    );
  });

  it("states the hook hold, its fail-closed reads and its residuals on SECURITY.md and the mapping page", () => {
    const verbs = between(security, "`stamity run start` puts an unattended run", "| Anyone whose text an unattended run sends out");
    for (const claim of [
      "The same hold covers the hook code later sessions run: `.stamity/packs/`, the folder of hook declarations `Base:`'s manifest names (`.stamity/hooks/` by default), held whole wherever it lies, and each script, and each launcher given as a repository path rather than a name on `PATH`, that a user or pack hook declaration at `Base:` names",
      "read at `Base:` through the engine's own hook reader, so a run cannot unhold one by editing its declaration, and held whether or not it exists there",
      "Anything that hold cannot resolve cleanly at `Base:` refuses the call before it stages, naming its cause, and nothing is pushed",
      "a path that passes through a link or a submodule there, one spelled in another letter case than the tree's or ambiguous by case, a `..` segment, a path that is absolute or leaves the repository, and a script the hold could not stand in for",
      "a byte-order mark is read as the manifest reader reads it",
      // TEST CHANGE, justified (plan 022 file 1, unit a16-security-pages, fix round 1, review/154; REQ-FLOW-102 as
      // built): the hold's reader moved into src/runs/hookPaths.ts (a6, `hookPathsAt` and `hookPathsRead`), and
      // src/cli/commands/run.ts only calls it, so the row's address names the module that holds the code.
      "`src/runs/hookPaths.ts::hookPathsAt`",
      // review/197: the residual widens from modules loaded outside the held folders to all a held script reads or loads.
      "The hook hold reads the declarations at `Base:` alone, so a hook written by hand into a client's settings file whose script lies outside the held folders, and anything a held script reads or loads beyond the files its declaration names, the contents of a folder it names included, are pushed as any other file, and a run that rewrites its record head's `Base:` moves the commit the hold reads",
      // review/196, review/197, review/198, review/199: every file a declaration names, present or not, and no folder.
      // TEST CHANGE, justified (plan 022 file 1, unit a16-security-pages; REQ-FLOW-102 as built, inbox rows review/202
      // and review/201): the hold reads only an option's `=` value, and holds whole a folder absent at `Base:`
      // (src/runs/hookPaths.ts, hookPathsRead's `values` and the `folder` test), so the row says both.
      "The hold covers every other file such a declaration names the same way, an option's `=` value or an argument word past the launcher, bare or written as a path, present at `Base:` or not; a folder it names is not held where it is present at `Base:`, one absent there is held whole, a value with a URL-like scheme (`unix:`, `npm:`) is not a path and is neither held nor refused, and a value naming a drive path is absolute and refuses.",
    ]) {
      expect(verbs, `the run verbs' row does not state: ${claim}`).toContain(claim);
    }
    const residuals = between(security, "### Cloud and unattended runs", "## Standards mapping");
    expect(residuals).toContain(
      "A head rewritten to name another `Base:` moves the commit the hook hold reads its declarations at, so a script only the true base's declarations name is pushed as any other file.",
    );
    expect(residuals).toContain(
      "**Hook code outside the held folders.** The hook hold follows the declarations the engine reads at `Base:`, the repository's own and the installed packs', and no other:",
    );
    expect(residuals).toContain("anything a held script reads or loads beyond the files its declaration names, the contents of a folder it names included");
    const mapping = flowed(read(SECURITY_MAPPING));
    for (const claim of [
      "hold `.stamity/packs/`, the hooks folder `Base:`'s manifest names and each script and repository-path launcher a hook declaration at `Base:` names the same way, refusing before they stage on anything they cannot resolve cleanly there",
      // TEST CHANGE, justified (plan 022 file 1, unit a16-security-pages; REQ-FLOW-102 as built, inbox rows review/202
      // and review/201): the mapping row follows SECURITY.md's, an option's `=` value and a folder absent at `Base:`.
      "and every other file such a declaration names, an option's `=` value or an argument word, present at `Base:` or not, but no folder present at `Base:` that it names (one absent there is held whole) and no value with a URL-like scheme,",
      "The hook hold reads the declarations at `Base:` alone: a hook written by hand into a client's settings file whose script lies outside the held folders, anything a held script reads or loads beyond the files its declaration names, and a run that rewrites its record head's `Base:` stay open.",
    ]) {
      expect(mapping, `the mapping page does not state: ${claim}`).toContain(claim);
    }
    // review/197: neither page keeps the narrower residual, in the row or in the residual list.
    expect(mapping).not.toContain("a module a held script loads from outside");
    expect(security).not.toContain("a module a held script loads from outside");
  });

  it("states Copilot's record lock and its race on SECURITY.md", () => {
    const guard = between(security, "| The main thread of any session", "| An unattended run, or the text that steers one | Pushing a change");
    expect(guard).toContain(
      "The session start updates that record under a lock beside it, `stamity/copilot-main-sessions.lock`, created exclusively and owner-only: it waits up to two seconds for another start's lock and breaks one older than ten seconds once, so two main sessions starting together are both recorded, and a lock it cannot take leaves the record as it was, so that session's asks are refused.",
    );
    const asks = between(security, "How each client answers an ask.", "Where no hook runs.");
    expect(asks).toContain(
      "The record's lock leaves one race: two session starts that both break one dead start's lock can leave one of their ids unrecorded, and that session's asks are then refused, the safe direction.",
    );
  });

  it("states n1's and n2's --paths reading on REQ-FLOW-092", () => {
    const bullet = nightBullet("REQ-FLOW-092");
    for (const claim of [
      "units `n1-eval-ending` and `n2-pending-marker`",
      "`--paths` names the files the run changed, every unit's files named again though each was committed at its checkpoint, and each learning file the close captured",
      "are staged by the verb itself (`RUN_FILES` and `runOwned`, `src/cli/commands/run.ts`; `content/skills/st-unattended/SKILL.md:101-102`)",
      "A `--paths` entry naming a path the run already committed is harmless",
      "a path never tracked keeps `not staged: <path> (no such file)`",
    ]) {
      expect(bullet, `REQ-FLOW-092's n6 bullet does not state: ${claim}`).toContain(claim);
    }
  });

  it("states n2's marker order, its clear and its residual on REQ-FLOW-093", () => {
    const bullet = nightBullet("REQ-FLOW-093");
    for (const claim of [
      "unit `n2-pending-marker` and its fix round",
      "The marker is read before anything is staged:",
      "before any `git add`, held-patch write or index restore",
      "a `SIGTERM` and, where the group outlives a grace, a `SIGKILL`",
      "the commit's git runs as the leader of a process group of its own",
      "each at the time it was read, no commit landed: the verb removes the marker, adds `commit not made: <cause>`, exits 1 and pushes nothing",
      "Every other case keeps the marker and reports `commit not checked`",
      "A hook that detaches its own child, or starts its own process group, leaves the group",
    ]) {
      expect(bullet, `REQ-FLOW-093's n6 bullet does not state: ${claim}`).toContain(claim);
    }
    expect(bullet).not.toMatch(/provabl/i);
    // review/191: alignOriginHead may write origin/HEAD before the marker read, so the bullet says "staged", not "write".
    expect(bullet).not.toContain("The marker is read before any write");
  });

  it("holds `.claude/hooks/**`, the packs and the declared hook code on REQ-FLOW-102", () => {
    const bullet = nightBullet("REQ-FLOW-102");
    for (const claim of [
      "unit `n4-held-claude-hooks`, with its fix round and its cap round",
      "The person-only paths gain `.claude/hooks/**`",
      "and `.stamity/packs/**`",
      "the folder of hook declarations `Base:`'s manifest names, `.stamity/hooks` by default, held whole wherever it lies",
      "and each launcher it names as a repository file rather than a name on `PATH` (`build/98`)",
      "refuses the call before anything is staged, exit 1, as `hold refused: <path> at Base: <why>, so the hook scripts it names are unknown and the run pushes nothing`",
      "a hook written by hand into a client's settings file whose script lies outside the held folders",
      "anything a held script reads or loads beyond the files its declaration names (`review/187`, `review/197`)",
      "Every other file an accepted declaration names is held the same way, present at `Base:` or not: an option's `=` value and an argument word past the launcher, bare or written as a path (unit `n7-held-below-top`, `review/196`, `review/199`).",
      "A folder it names is not held (`review/197`), and a value with a URL-like scheme, two characters or more before its colon (`unix:`, `npm:`), is not a path, neither held nor refused, while a value naming a drive path stays absolute and refuses (`review/198`).",
      "a run that rewrites its own record head's `Base:`",
    ]) {
      expect(bullet, `REQ-FLOW-102's n6 bullet does not state: ${claim}`).toContain(claim);
    }
  });

  it("states Copilot's record lock, its race and the re-measured facts on REQ-FLOW-123", () => {
    const bullet = nightBullet("REQ-FLOW-123");
    for (const claim of [
      "units `n5-copilot-record-lock` and `n3-copilot-remeasure`",
      "under an exclusive lock beside it, `stamity/copilot-main-sessions.lock`",
      "two starts that both break one dead holder's lock can leave one main session's id unrecorded",
      "a main-agent call carries none of the helper fields",
      "`sessionStart` fires once, for the main session alone",
    ]) {
      expect(bullet, `REQ-FLOW-123's n6 bullet does not state: ${claim}`).toContain(claim);
    }
  });

  it("re-points REQ-PROVE-042's checklist lines and names the three facts", () => {
    const proof = flowed(read("docs/specs/prove-behavior-and-value.md"));
    const text = between(proof, "### REQ-PROVE-042 ", "### REQ-PROVE-043 ");
    expect(text).toContain("(`:344-372`)");
    expect(text).toContain("(`:374-392`, added 2026-10-19");
    expect(text).not.toContain("`:344-364`");
    expect(text).toContain("also checks, for Copilot CLI, the three facts its guard's ask rests on");
    // review/192: the provenance paragraph names the sha those two ranges read at.
    expect(proof).toContain("but for REQ-PROVE-042's two release-checklist ranges, re-pointed on 2026-10-19, which read at `96e5b3ac`");
  });

  it("dates the night's re-pointed skill citations beside each provenance sentence (review/173)", () => {
    const flowedSpec = flowed(spec);
    expect(flowedSpec).toContain("and on 2026-10-19 plan 021's second file re-pointed each citation of `content/skills/st-unattended/SKILL.md` that the two lines its unit `n1-eval-ending` added moved, and those read at `96e5b3ac`");
    expect(flowedSpec).toContain("but for the citations of `content/skills/st-unattended/SKILL.md` re-pointed on 2026-10-19, which read at `96e5b3ac`");
    expect(flowed(read("docs/specs/board-writes.md"))).toContain("read at `4daeb214`; its skill citation re-pointed on 2026-10-19 at `96e5b3ac`");
    expect(flowed(read("docs/specs/orchestrator-context.md"))).toContain("the skill citation in its As built line re-pointed on 2026-10-19 at `96e5b3ac`");
  });

  it("states the marker's order on the cloud reference and the night on the changelog", () => {
    // The cloud reference is a content file; the map's `content/**` entry runs every test, this one included.
    const cloud = flowed(read("content/skills/st-unattended/references/cloud.md"));
    expect(cloud).toContain("The verb reads the marker before it stages anything, so its refusal leaves the index and the held patch as that commit left them.");
    expect(cloud).toContain("A checkpoint that reports `commit not made` is not this case");
    // review/190: the clear rests on reads made at one time, so the reference says so.
    expect(cloud).toContain("none had landed at the time it was read");
    expect(cloud).not.toContain("and none landed,");
    const changelog = flowed(read("CHANGELOG.md"));
    expect(changelog).toContain("The verbs read that marker before they stage anything");
    expect(changelog).toContain("that call reports `commit not made`");
    // The held hook code, no wider than the code holds it (n4 with its fix and cap rounds).
    expect(changelog).toContain(
      "hooks, the scripts under `.claude/hooks/` and `.cursor/hooks/`, the installed packs, and the scripts and repository-path launchers the hook declarations at the run's base name",
    );
    expect(changelog).toContain("A hook declaration the verbs cannot read cleanly at the base refuses the push");
    // review/196, review/197, review/199, build/104: every file a declaration names, present or not, no folder, and the widened residual.
    expect(changelog).toContain(
      "Every other file such a declaration names, an option's value or an argument word, is held too, whether or not it is present at the base; a folder it names is not held.",
    );
    expect(changelog).toContain(
      "and anything a held script reads or loads beyond the files its declaration names, the contents of a folder it names included, are not held.",
    );
    expect(changelog).not.toContain("a module a held script loads from outside");
    expect(changelog).not.toContain("hooks and the scripts Claude Code's and Cursor's hooks run");
    expect(changelog).toContain("under a lock, so two sessions starting together are both recorded");
    // review/164: the PowerShell refusal reads an unquoted `@` in a word after `run`, as review/147 corrected the spec.
    expect(changelog).toContain("an unquoted `@` in a word after `run`");
    expect(changelog).not.toContain("an unquoted `@` after the program");
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

  // The guard's row and its gap state the nested lines and gh's create-and-push alias as read and refused, as
  // SECURITY.md does, the Windows-path git and a directory change inside a nested line too, and name the config-named
  // program beside the respelling residual.
  it("states the guard's nested lines as read, not as gaps", () => {
    const flat = text.replace(/\s+/g, " ");
    expect(flat).not.toContain("being closed");
    expect(flat).toContain("a Windows-path git inside a PowerShell payload is read as git");
    expect(flat).toContain("A directory change inside those lines is followed");
    expect(flat).toContain("a `-c` pair outside the display and identity keys is refused");
    expect(flat).not.toContain("and the two they do not, PowerShell's command wrappers");
    expect(flat).not.toContain("PowerShell's command wrappers and gh's alias for the create-and-push form are not");
    expect(flat).toContain("are read as lines of their own, and gh's alias for the create-and-push form is refused");
    expect(flat).toContain("a git builtin can run a program the repository's own configuration names");
    expect(flat).toContain("every folder's editor settings, tasks and MCP-server files, are held");
  });

  // ADDED 2026-10-16 (plan 021 file 1, the whole-branch round's page fix): the rows and gaps carry
  // what SECURITY.md now states, the origin pin and its work-tree residual among them.
  it("states the origin pin, the held links and the new refusals with their residuals", () => {
    const flat = text.replace(/\s+/g, " ");
    for (const claim of [
      "an account with no push right at all is refused",
      "names another repository than the one `run start` pinned in the run folder's `origin.json`",
      "and a symbolic link at a held glob's folder, into an inert patch",
      "a merge or a review approval",
      "a `git remote` write and a `git config` write of a `remote.*` or `url.*` key",
      "one of git's program-valued variables",
      // MOVED 2026-10-18 (PR #112 round 4): create_pull_request joined the MCP rows.
      // TEST CHANGE, justified (plan 021 file 2, v0a, v0a2 and v0d; REQ-FLOW-120, REQ-FLOW-123, REQ-FLOW-124): thirteen
      // of the fourteen MCP rows now ask, attended, and `delete_repository` alone is denied, so the mapping says so.
      "fourteen rows more name the GitHub MCP server's merge, branch-content, branch-creation, review-submitting, pull-request-creating, pull-request-update and repository-delete tools by name",
      "thirteen asking and `delete_repository` denied",
      "the GitHub MCP server on the clients that take no per-tool deny",
      "A `git config` write of a `url.*` key is refused beside a `remote.*` one, the run verbs' origin pin the second check",
      "The held set is a glob list, and the origin pin a work-tree file",
      "rewrites that file together with git's configuration passes the check",
      "which was not checked to follow it",
    ]) {
      expect(flat, `the mapping page does not state: ${claim}`).toContain(claim);
    }
    expect(flat, "the mapping page says again that a url.* write passes the guard").not.toMatch(/`url\.\*` key passes/);
  });

  // ADDED 2026-10-16 (plan 021 file 1, the whole-branch round's second page fix): the mapping
  // page carries what SECURITY.md now states: the thirteen MCP rows and the server-name gap, the
  // hooks residual, the any-program variable rule and `gh pr update-branch`.
  // MOVED 2026-10-18 (PR #112 round 4): fourteen rows.
  it("states the fourteen MCP rows, the hooks residual and the any-program variable rule", () => {
    const flat = text.replace(/\s+/g, " ");
    for (const claim of [
      "`gh pr update-branch`",
      "a line, whatever program it runs, that sets one of git's program-valued variables or one of its configuration variables, `GIT_CONFIG_GLOBAL` and `GIT_CONFIG_SYSTEM` among them",
      // TEST CHANGE, justified (plan 021 file 2, v0a, v0a2 and v0d; REQ-FLOW-120, REQ-FLOW-123, REQ-FLOW-124): thirteen
      // of the fourteen MCP rows now ask, attended, and `delete_repository` alone is denied, so the mapping says so.
      "a pull-request update through that server asks whole",
      "a hook the run writes, which a run verb's commit or push runs",
      "the server configured under another name than `github` on Claude Code",
      "A hook the run writes runs inside a run verb's commit or push, which keeps the repository's hooks",
      "a merge, branch write or review approval through the GitHub MCP server is a tool call no shell guard sees",
      // TEST CHANGE, justified (plan 021 file 2, v0a2 and v0d): the MCP rows are ask rows and one deny row now.
      "on Claude Code its ask and deny rows miss the server configured under another name than `github`",
    ]) {
      expect(flat, `the mapping page does not state: ${claim}`).toContain(claim);
    }
    for (const stale of ["five rows more deny", "thirteen rows more deny", "and a git call on a line that sets one of git's program-valued variables"]) {
      expect(flat, `the mapping page says again: ${stale}`).not.toContain(stale);
    }
  });

  // ADDED 2026-10-16 (plan 021 file 1, the final derived lane): the mapping page carries the run
  // verbs' environment residual beside `PATH` choosing the `gh`, and states `Set-Item env:` and
  // `New-Item env:` as refused spellings, PowerShell's other `env:` drive commands the gap.
  it("states the run verbs' environment and the env: drive spellings as SECURITY.md does", () => {
    const flat = text.replace(/\s+/g, " ");
    for (const claim of [
      "the environment the run verbs start under (`PATH`, `HOME`, `XDG_CONFIG_HOME`) choosing the git they run and the global configuration it reads",
      "PowerShell's `Set-Item env:` and `New-Item env:` among the spellings; a program-valued variable set through another of PowerShell's `env:` drive commands passes",
      "`export`, and `declare`, `typeset` or `local` given `-x`, with a value or without one, a name `read`, `for`, `printf -v`, `mapfile`, `readarray` or `getopts` assigns with no `=`, any of them named on a line that turns allexport on with `set`'s letter or the option's name, and PowerShell's `Set-Item env:`",
      // TEST CHANGE, justified (plan 021 file 2, v0b and v0d; REQ-FLOW-121, REQ-FLOW-122): a run verb stands alone on
      // its line, so these spellings pass only on an earlier line of a shell that persists, where the verb's git
      // drops a program-valued variable and keeps a `GIT_CONFIG_*` one.
      // TEST CHANGE, justified (plan 022 file 1, unit a16-security-pages; REQ-FLOW-104, inbox row review/252): the form
      // without the colon passes as the colon form does, so the mapping lists it beside it, as SECURITY.md does.
      "a respelling SECURITY.md names. So do `readonly NAME=…` and zsh's `readonly -x`, `select`, zsh's `print -v` and `foreach`, `: ${NAME:=…}` and `: ${NAME=…}`, allexport turned on by zsh's `setopt -a` or by a shell started with `-a`, and `source <file>`, on a line of their own in a shell that persists, each changing the environment a later verb's git starts from, since a run verb's own line holds the verb alone; set that way, a program-valued variable is removed from the verb's git and a `GIT_CONFIG_*` one reaches it; the pre-flight's refusal of an account that can push to the default branch is the control that holds",
      "a program-valued variable set through a PowerShell `env:` drive command other than `Set-Item` and `New-Item` among the ways",
    ]) {
      expect(flat, `the mapping page does not state: ${claim}`).toContain(claim);
    }
    for (const stale of [
      "`Set-Item env:` form of a program-valued variable",
      "PowerShell `Set-Item env:` line setting a program-valued variable",
      "and so does one another builtin sets with allexport off",
    ]) {
      expect(flat, `the mapping page says again: ${stale}`).not.toContain(stale);
    }
  });

  // ADDED 2026-10-18 (PR #112 round 3): the mapping page carries what SECURITY.md now states of the guard's round 3
  // readings, the run folder ceiling and the run verbs' default-branch write, with their residuals.
  it("states round 3's guard readings, the run folder ceiling and the default-branch write as SECURITY.md does", () => {
    const flat = text.replace(/\s+/g, " ");
    for (const claim of [
      "a `gh` group outside gh's built-in commands (an alias or an extension) and `gh alias set` or `import`",
      "A tag includes a `git update-ref` write on `refs/tags/`, a publish includes npm's unique prefixes of `publish` and a manager run through Corepack, and the merge queue's `enqueuePullRequest` is a merge",
      "A shell call it cannot read, a line nested more than four levels deep among them, is refused",
      "a gh alias or extension attended and a `git update-ref --stdin` text read from a file among them",
      "point `origin/HEAD` at the default branch GitHub's REST API names, refuse an unattended run when neither REST nor `origin/HEAD` names the default branch (`run start` exits 1, `checkpoint` and `end` refuse the commit)",
      "`src/cli/commands/run.ts::alignOriginHead`",
      "a push of a default branch named neither `main` nor `master` passes the person-only rule",
      "Past 2,000 run folders the guard refuses every call the unattended rule would read, attended sessions included",
    ]) {
      expect(flat, `the mapping page does not state: ${claim}`).toContain(claim);
    }
  });

  // ADDED 2026-10-18 (PR #112 round 4): the mapping page carries what SECURITY.md now states of the guard's round 4
  // readings and the MCP creation row, with the three attended residuals and the controls that hold.
  it("states round 4's guard readings and residuals as SECURITY.md does", () => {
    const flat = text.replace(/\s+/g, " ");
    for (const claim of [
      "A `git symbolic-ref` write naming a tag is a tag, and one pointing a name at the default branch a push of that branch to come",
      "each curl request after `--next` is judged alone",
      "the GraphQL repository-settings, protection, ruleset and custom-property mutations, and a custom-property REST write, are protection writes",
      "and so is an HTTP call whose method or targets the line hides (`HTTP_TARGET_HIDDEN`)",
      // TEST CHANGE, justified (plan 021 file 2, v0a, v0a2 and v0d; REQ-FLOW-120, REQ-FLOW-123, REQ-FLOW-124): thirteen
      // of the fourteen MCP rows now ask, attended, and `delete_repository` alone is denied, so the mapping says so.
      "with a `PreToolUse` hook on those tools that refuses each while a run is unattended",
      "a symbolic ref already on disk, a branch switch earlier on the line before a push whose destination is implied, and a method, body or URL from curl's or wget's default configuration file",
      "the remote's own protection the control that holds; unattended, the raw-push refusal holds the first two",
    ]) {
      expect(flat, `the mapping page does not state: ${claim}`).toContain(claim);
    }
  });

  // ADDED 2026-10-18 (PR #112 round 4b): the mapping page carries round 4b's readings as SECURITY.md does, and names a
  // REST target held in a variable among the respellings.
  it("states round 4b's guard readings and the variable-target respelling as SECURITY.md does", () => {
    const flat = text.replace(/\s+/g, " ");
    for (const claim of [
      "and the symref commands of a `git update-ref --stdin` text the line carries are read the same way",
      "a curl body counts as one attached or in a short cluster as well as apart",
      "(`HTTP_TARGET_HIDDEN`): a method held in a variable or a substitution,",
      "a `git update-ref --stdin` text read from a file among them, a REST target held in a variable too",
      "a REST target held in a variable, which the guard judges as the literal word, are such respellings",
      "and an HTTP method held in a variable or a substitution, are refused as `HTTP_TARGET_HIDDEN`",
    ]) {
      expect(flat, `the mapping page does not state: ${claim}`).toContain(claim);
    }
  });

  // ADDED 2026-10-18 (PR #112 round 4d): the mapping page carries round 4d's readings, the hidden-call list's curl
  // cluster holding `:`, the symref-word respelling and the configuration files' unattended control as SECURITY.md does.
  it("states round 4d's guard readings, the symref-word respelling and the configuration files' control as SECURITY.md does", () => {
    const flat = text.replace(/\s+/g, " ");
    for (const claim of [
      "are read the same way, each wherever it stands in the text",
      "and so does a curl method, a letter after another value letter being that letter's value",
      // TEST CHANGE, justified (plan 021 file 2, v0d; pr/91): the code reads any prefix of two or more letters of a
      // listed long option, not a unique one, so the mapping states what the code does, as SECURITY.md does.
      "a curl or wget long option counts from any prefix of two or more letters of a long option the guard lists, read as the first it begins, and gh's `-i` clustered with a method or a field, and its `-X=<method>`, count as gh reads them",
      "attached in a short cluster too or cut from the line by an unquoted one",
      "a wget write reading `-i`, and a curl short cluster holding `:` among other letters",
      "a gh extension, a symref command word the line cannot show, a `git update-ref --stdin` text read from a file",
      "the pre-flight's refusal of an account that can push to the default branch holds the third on that branch alone: a write such a file hides reaches the run's own branch around the run verbs, the held paths and the last scan",
    ]) {
      expect(flat, `the mapping page does not state: ${claim}`).toContain(claim);
    }
    expect(flat, "the mapping page names the pre-flight's wall as the third residual's whole control again").not.toContain(
      "can push to the default branch the third",
    );
  });

  // ADDED 2026-10-18 (PR #112 round 5): the mapping page carries round 5's readings and the tag ceiling as SECURITY.md
  // does.
  it("states round 5's guard readings and the tag ceiling as SECURITY.md does", () => {
    const flat = text.replace(/\s+/g, " ");
    for (const claim of [
      "both verdicts read a REST path with its dot segments resolved as well as written",
      "`gh repo sync` naming a destination repository is a force push under `--force`, and otherwise a push of the default branch unless `--branch` names another branch the line shows",
      "`gh repo unarchive` is a repository write, as `gh repo archive` is",
      "as is a push naming a refspec where the local tags pass 10,000 names (`TAG_NAMES_OVER_10000`) or `packed-refs` passes 8 MiB (`PACKED_REFS_OVER_8388608`)",
      "and past 10,000 local tag names, or a `packed-refs` file past 8 MiB, it refuses every push naming a refspec, attended sessions included",
    ]) {
      expect(flat, `the mapping page does not state: ${claim}`).toContain(claim);
    }
  });

  // ADDED 2026-10-19 (plan 021 file 2, unit v0d-guard-pages; REQ-FLOW-104, REQ-FLOW-121 to REQ-FLOW-124): the
  // mapping page carries each client's answer, the refuse class, the run verb's line, the settings' two lists and the
  // residuals as SECURITY.md does.
  it("states file 2's ask rule, each client's answer and the residuals as SECURITY.md does", () => {
    const flat = text.replace(/\s+/g, " ");
    for (const claim of [
      "a deletion, a force push or an act that cannot be undone is refused on every client, attended or not, and one such act on a line refuses the whole call",
      "attended, an act that can be undone asks on Claude Code for one click, refused where a sub-agent runs it or in Claude Code's `auto` permission mode",
      // TEST CHANGE, justified (plan 021 file 2, units w4-copilot-ask and w5-ask-pages; REQ-FLOW-123): Copilot CLI now
      // asks for the person's own agent (src/hooks/scripts.ts, attendedAsk's Copilot copy), so it leaves the list of
      // clients that refuse, and Cursor's hooks page joins its measurement as a reason.
      "and on Copilot CLI for the person's own agent alone, a call with no helper field whose session id Copilot's session start recorded (measured on 1.0.98, 2026-10-19)",
      "while Cursor, which ran a command despite a `beforeShellExecution` ask under `--force` (measured 2026-10-18) and whose hooks page says `preToolUse`'s ask is not enforced, and Codex, whose hooks page says an ask is not honoured, refuse it",
      "Copilot CLI's on 1.0.98, whose experimental assisted mode may hand the ask to an LLM judge a hook cannot see",
      "`gh extension exec`",
      "and a line that runs `stamity run start`, `checkpoint` or `end` unless the verb stands alone on it as one simple command",
      "An attended ask holds only while the client honours it",
      // TEST CHANGE, justified (plan 022 file 1, unit a16-security-pages; REQ-FLOW-036): an ask row the setting no
      // longer renders leaves when the ledger record lists it (src/manifest/claudeSettings.ts, `leavingRows`).
      "No `permissions.deny` row leaves `.claude/settings.json`, and an ask row leaves only where the autonomy setting no longer renders it and the ledger record lists its hash",
      "A checkout synced from an unreleased build before 1.16.0 keeps the deny rows it wrote for acts that now ask",
      "Attended, an ask holds only while the client honours it, and where no hook runs a respelling no settings row names costs one click",
      // TEST CHANGE, justified (plan 022 file 1, unit a16-security-pages; REQ-FLOW-131): the run verbs compare it with
      // the pre-flight's record (src/runs/gitSurface.ts::checkSurfaceRecord), so it stays open only that far.
      "a `GIT_CONFIG_*` value changed or gained after it as far as the run verbs' compare with the pre-flight's record, which refuses it, stay open",
      "which the cloud readiness hook's `npm ci` install scripts inherit and can append to",
      "and a run verb's line the stand-alone rule skips, since it finds the verb by its name in the line's text",
    ]) {
      expect(flat, `the mapping page does not state: ${claim}`).toContain(claim);
    }
    expect(flat, "the mapping page says again that the guard refuses every person-only act").not.toContain(
      "refuses a person-only act on every client, naming the rule",
    );
    expect(flat, "the mapping page says again that Copilot's payload names no calling agent").not.toContain(
      "names no calling agent",
    );
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

  // ADDED 2026-10-16 (plan 021 file 1, unit u21-security-page, REQ-FLOW-104): a row per control the
  // security page's table gained for the cloud and unattended runs, and the two strip rows the
  // mapping lacked beside them (the resume card's and the ledger writer's).
  it("holds a row per cloud control, and the resume card's and the ledger writer's strip rows", () => {
    const rows = surfaces()
      .split("\n")
      .filter((line) => line.startsWith("| "));
    for (const pointer of [
      "`src/runs/preflight.ts::runPreflight`",
      "`src/hooks/personOnly.ts::personOnlyVerdict`",
      "`src/hooks/personOnly.ts::unattendedPushVerdict`",
      "`src/cli/commands/run.ts::runCheckpoint`",
      "`src/runs/morning.ts::screenOutbound`",
      "`src/runs/resumeCard.ts::screenCard`",
      "`src/runs/ledgerStore.ts::committedText`",
    ]) {
      expect(
        rows.some((row) => row.includes(pointer)),
        `the mapping holds no surface row citing ${pointer}`,
      ).toBe(true);
    }
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
      // TEST CHANGE, justified (2026-10-14, plan 020 file 1, unit d4-docs-site): the
      // `node scripts/generate-plugin-packages.mjs` row left with the plugin route; unit
      // d5-scripts-trees deletes the script and its `dist/plugins/` tree, and CONTRIBUTING's
      // regeneration table drops the row with the plugin and APM manifest rows.
      "node dist/cli.js sync",
    ]) {
      expect(text, `CONTRIBUTING.md omits \`${command}\``).toContain(command);
    }
    // ADDED 2026-10-14 (plan 020 file 1, unit d4-docs-site): the page named four scripts the
    // plugin and APM routes' deletion removes (`generate-plugin-manifests.mjs`,
    // `generate-apm-package.mjs`, `generate-plugin-packages.mjs`, `apm-install-smoke.mjs`). Every
    // `node scripts/<file>.mjs` it names now has to exist, so a row left behind by a deletion fails
    // here rather than sending a contributor to a missing file.
    const named = new Set([...text.matchAll(/node (scripts\/[\w./-]+\.mjs)/g)].map((match) => match[1] ?? ""));
    expect(named.size, "CONTRIBUTING.md names no script to run").toBeGreaterThanOrEqual(4);
    for (const script of named) {
      expect(existsSync(join(REPO_ROOT, script)), `CONTRIBUTING.md names missing ${script}`).toBe(true);
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
 * ADDED in run 2026-10-08_maintainer-tooling (integration step 1): the two pages that say how
 * `all-ci-checks` passes. `test/ci/workflow.test.ts` pins that both name the lane classifier; these
 * pin what `all-ci-checks` gained beside the records lane, the proven push and three more lanes,
 * and read the lane names off the classifier itself, so a lane the pages never mention fails here
 * rather than reading as documented.
 */
describe("the CI hand pages", () => {
  for (const page of [CONTRIBUTING, GOVERNANCE]) {
    it(`${page} names the proven-push reader and every lane the classifier declares`, () => {
      const text = read(page);
      expect(text, `${page} does not describe the proven push`).toContain("scripts/ci/pr-proven.mjs");
      for (const lane of Object.keys(LANE_PATHS)) {
        expect(text, `${page} does not name the \`${lane}\` lane`).toContain(`\`${lane}\``);
      }
      // The claim the lanes made false: a learnings change takes its own lane, not full CI.
      expect(text, `${page} still sends a learnings change to full CI`).not.toMatch(
        /learnings change[^.]*full/i,
      );
    });
  }
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
    // The exception the same paragraph has to carry, or the rule above is a trap: the preset
    // holds the identity as data, and nothing derives it.
    //
    // TEST CHANGE, justified (2026-10-14, plan 020 file 1, unit d4-docs-site): this named
    // `renovate/plugins.json` beside `renovate/companion.json`. The plugin preset leaves with the
    // plugin route (unit d5-scripts-trees deletes it, unit d1-fork-identity stops retargeting it),
    // so the guide names the one preset the identity script still moves, never says the script
    // moves the deleted one, and says a fork tree still holding it keeps it untouched.
    expect(guide, "the guide never names `renovate/companion.json` as identity data").toContain(
      "`renovate/companion.json`",
    );
    expect(guide, "the guide still says the script retargets `renovate/plugins.json`").not.toMatch(
      /renovate\/plugins\.json` names the repository|moves the two\s+Renovate presets/,
    );
    expect(flowed(guide), "the guide never says a leftover plugin preset is left untouched").toContain(
      flowed("A fork tree that still holds the\n`renovate/plugins.json` preset of the deleted plugin route keeps it untouched."),
    );
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

  // TEST CHANGE, justified (2026-10-14, plan 020 file 1, unit d4-docs-site, REQ-PLUGIN-027 and
  // REQ-PLUGIN-029 retired in part): "the enterprise-forks guide states the plugin-distribution route
  // it tells a fork to run" stood here and pinned the guide's `## Ship your fork's plugin
  // distribution` section (its two builders, the `stamity.distribution` keys and the forced
  // `plugin-dist` push). That section, the APM section before it and the managed-settings rollout
  // after the release section left the guide with the two routes; the case below holds the guide to
  // that removal instead, so a section or a builder coming back fails by name.
  it("the enterprise-forks guide carries no section or command of the deleted plugin and APM routes", () => {
    const guide = read(ENTERPRISE_FORKS);
    const headings = [...guide.matchAll(/^#{2,4} (.+)$/gm)].map((match) => match[1] ?? "");
    expect(headings.length, "the fork guide read as having no headings").toBeGreaterThan(20);
    for (const removed of [
      "Ship your fork through APM",
      "Ship your fork's plugin distribution",
      "Roll the plugin out to your organization",
    ]) {
      expect(headings, `the fork guide still carries "${removed}"`).not.toContain(removed);
    }
    // TEST CHANGE, justified (2026-10-14, run 2026-10-14_cli-native, review/3): a fork set up from
    // the 1.14 guide lists the two generators below in its `.stamity/upstream.json` `regenerate`,
    // and 1.15.0 deletes both, so its integration ends `regenerate-failed` unless the guide tells it
    // to drop them (plan 020 file 1, Risks). The one section that says so may name those two
    // generators; it is held to naming them, the five generated paths, `stamity.distribution` and
    // `renovate/plugins.json`, and every other line of the guide stays under the ban.
    const dropSection = sectionOf(guide, "### Drop the deleted routes from a fork set up before 1.15.0");
    expect(dropSection, "the fork guide no longer tells an existing fork what to delete").not.toBe("");
    for (const named of [
      "node scripts/generate-plugin-manifests.mjs",
      "node scripts/generate-apm-package.mjs",
      "`.apm/**`",
      "`apm.yml`",
      "`plugin.json`",
      "`.claude-plugin/**`",
      "`.cursor-plugin/**`",
      "`stamity.distribution`",
      "`renovate/plugins.json`",
      "`regenerate-failed`",
    ]) {
      expect(flowed(dropSection), `the deletion section does not name ${named}`).toContain(named);
    }
    const outsideDrop = guide.replace(dropSection, "");
    for (const generator of ["generate-apm-package.mjs", "generate-plugin-manifests.mjs"]) {
      const where = `the fork guide still names \`${generator}\` outside the deletion section`;
      expect(outsideDrop, where).not.toContain(generator);
    }
    for (const command of [
      "generate-plugin-packages.mjs",
      "build-plugin-runtime.mjs",
      "build-plugin-distribution.mjs",
      "managed-settings.mjs",
      "apm install",
      "plugins.md",
    ]) {
      expect(guide, `the fork guide still names \`${command}\``).not.toContain(command);
    }
    // The release section survives, minus its distribution steps: a fork releases its CLI, and the
    // page no longer tells it to push a distribution branch or tag.
    const release = sectionOf(guide, "## Release your fork");
    expect(release, "the fork guide lost its release section").not.toBe("");
    expect(release, "the release section still pushes a plugin distribution").not.toMatch(
      /plugins\/v<version>|plugin distribution|release\.json/,
    );
    // ADDED 2026-10-14 (run 2026-10-14_cli-native, review/5): `publish` in
    // `.github/workflows/fork-release.yml` still creates the GitHub release `v<version>` with the
    // tarball and its `.sha256`, re-uploads only missing assets, and its notes tell a consumer to
    // run `sha256sum -c`; the section that approves that job names all three.
    for (const claim of [
      "creates the GitHub release `v<version>`",
      "An existing GitHub release receives only the assets it is missing",
      "`sha256sum -c <asset>.sha256`",
    ]) {
      expect(flowed(release), `the release section does not say: ${claim}`).toContain(claim);
    }
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

  // TEST CHANGE, justified (2026-10-14, plan 020 file 1, unit d4-docs-site, REQ-PLUGIN-030 retired:
  // "superseded by the fork-only quickstart page"). Two cases that stood here left with the plugin
  // route: "the enterprise-forks guide's managed-settings block is the renderer's own output" (the
  // rollout section and `scripts/plugins/managed-settings.mjs` are deleted) and "the plugins guide
  // adds a Codex marketplace only at a ref" (`docs/plugins.md` is deleted). The quickstart case was
  // "routes into the two guides"; the page is now the fork-only route map, so it routes into the
  // fork guide, and its other steps link `docs/getting-started.md`, whose headings are now held the
  // same way the fork guide's are. The no-command-block rule, the 120-line budget, the floor of
  // sixteen routed steps and the one-link-per-step rule are unchanged.
  it("the enterprise quickstart routes into the fork guide and repeats none of its commands", () => {
    // Plan 010, unit docs-quickstart. The page is a route map, not a second copy: it orders the
    // enterprise steps by day and hands each one to the guide that owns it. Three properties hold
    // it to that. It links the fork guide and no plugin page; it carries no fenced block longer
    // than one line, so no command block from a guide is restated here to drift from its owner;
    // and it stays within its 120-line budget, which the cell declares.
    const text = read(ENTERPRISE_QUICKSTART);
    const targets = linkTargets(text);
    expect(targets, "the quickstart does not link the fork guide").toContain("enterprise-forks.md");
    expect(targets, "the quickstart still links the deleted plugins guide").not.toContain("plugins.md");
    for (const block of fencedBlocks(text)) {
      expect(lines(block.trim()).length, "the quickstart carries a multi-line fenced block").toBeLessThanOrEqual(1);
    }
    expect(lines(text).length, "the quickstart is over its 120-line budget").toBeLessThanOrEqual(120);

    // A step names the section it hands off to as its link text, because a cross-page `#fragment`
    // is refused by the link check above. So the heading is the only anchor the page has, and it
    // is held here: every link into either guide names a heading that guide carries, and a heading
    // renamed there fails here instead of leaving a step that points at nothing.
    const headings = new Map<string, Set<string>>();
    for (const guide of [ENTERPRISE_FORKS, GETTING_STARTED]) {
      const found = [...read(guide).matchAll(/^#{1,6} (.+)$/gm)].map((match) => match[1] ?? "");
      headings.set(guide.replace(/^docs\//, ""), new Set(found));
    }
    let routed = 0;
    for (const match of text.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)) {
      const known = headings.get(match[2] ?? "");
      if (known === undefined) continue;
      expect(known.has(match[1] ?? ""), `the quickstart links "${match[1]}", no heading in ${match[2]}`).toBe(true);
      if (match[2] === "enterprise-forks.md") routed += 1;
    }
    // Every step the cell names, and nothing degenerate: a page that dropped to a bare link per
    // guide would pass the two containment checks above. Counted into the fork guide alone, so a
    // step moved to another page cannot keep the floor.
    expect(routed, "the quickstart routes fewer steps than the day sections name").toBeGreaterThanOrEqual(16);

    // One link per step. A step is a bullet under a day heading; two links in one is two steps,
    // and none is a step the reader cannot follow.
    for (const day of ["## Day 0: make the fork", "## Day 1: release and roll out", "## Day 2: take updates"]) {
      const bullets = lines(sectionOf(text, day)).filter((line) => line.startsWith("- "));
      expect(bullets.length, `${day} carries no steps`).toBeGreaterThan(0);
      for (const bullet of bullets) {
        expect(linkTargets(bullet).length, `a step under ${day} carries other than one link`).toBe(1);
      }
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
        // Fixture data kept out of the test-input census: built at run time, as a literal this bold span reads as a glob over the learnings.
        ["**", "refuses", "**"].join(""),
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
    // it. The plumbing verbs are deliberately absent — `learn`, `handoff`, `ledger` and `gate` are
    // not something a reader types.
    const verbs = [
      "init",
      "sync",
      // TEST CHANGE, justified (plan 022 file 2, unit b9-upgrade-verb, REQ-FLOW-034): `upgrade`
      // joins this copy of the surface from its CLI position after `sync`, with the README array.
      "upgrade",
      "check",
      "validate",
      "add",
      "config",
      "workspace",
      "worktree",
      // TEST CHANGE, justified (2026-10-14, plan 020 file 1, unit d4-docs-site): `plugin` leaves
      // this second hand-maintained copy of the surface with the README array above, from the
      // same CLI position.
      "clean",
    ];
    for (const command of verbs) {
      expect(text, `the getting-started guide omits \`${command}\``).toContain(`\`${command}\``);
    }
    // ADDED 2026-10-14 (plan 020 file 1, unit d4-docs-site): containment alone cannot see a verb
    // the CLI dropped and the page's `·` list kept, which is the shape the plugin verb's removal
    // takes. The list under the verbs heading is held to the array, order included, and the
    // heading's count word to its length, as README's case above holds README's.
    const section = text.split(/^(?=## )/m).find((part) => /^## The [a-z]+ verbs\n/.test(part)) ?? "";
    expect(section, "the getting-started guide has no `## The <n> verbs` section").not.toBe("");
    const run = /((?:`[a-z-]+` · )+`[a-z-]+`)/.exec(section.replaceAll("\n", " "))?.[1];
    expect(run, "the getting-started verbs section carries no `·` verb list").toBeDefined();
    expect((run ?? "").split(" · ").map((verb) => verb.replaceAll("`", ""))).toEqual(verbs);
    expect(section.startsWith(`## The ${countWord(verbs.length)} verbs\n`)).toBe(true);
    expect(text, "the getting-started glossary counts the verbs apart from its list").toContain(
      `one of the ${countWord(verbs.length)} names you type after \`stamity\``,
    );
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

  it("getting started tells an APM or plugin user the routes are gone and which refs still resolve", () => {
    // ADDED 2026-10-14 (run 2026-10-14_cli-native, review/4): an unpinned `apm install` or a
    // marketplace add of this repository breaks when `main` loses the trees, and plan 020 file 1's
    // Risks name this page as where such a user learns it, with the frozen refs and the one route.
    const section = flowed(sectionOf(read(GETTING_STARTED), "### If you installed through APM or a plugin"));
    expect(section, "the getting-started guide says nothing about the removed routes").not.toBe("");
    for (const claim of [
      "1.15.0 removes the APM route and the client-plugin route",
      "`plugin-dist`",
      "`plugins/v<version>`",
      "run `init`",
    ]) {
      expect(section, `the removed-routes section does not say: ${claim}`).toContain(claim);
    }
  });

  it("tells a Codex reader when to print the resume card by hand", () => {
    // The by-hand `stamity ledger status` advice named Cursor and Copilot only, while Codex
    // prints the card only with its hooks enabled and trusted, and no measured `codex exec` run
    // has ever run a project hook: none on codex-cli 0.154.0 (2026-09-15) and none in 3 of 3
    // runs on 0.155.1 (2026-09-30), the cause not isolated, since the project was trusted only
    // through a per-invocation override (the measurement src/adapters/codex.ts's hook-enforcement
    // cap and docs/troubleshooting.md's "Your Codex hook never runs" carry). All three loading
    // steps are named, since a reply naming only the flag is the half-answer that measurement
    // records.
    const text = read(GETTING_STARTED).replace(/\s+/g, " ");
    expect(text).toContain("Run it on Codex too when its hooks are not running");
    expect(text).toContain("`[features] hooks = true`");
    expect(text).toContain("the project trusted, and each hook trusted through `/hooks`");
    expect(text).toContain("`codex exec` runs no project hook at all");
  });

  it("dates every Codex hook claim to what codex-cli 0.155.1 measured, and keeps its open question", () => {
    // The learning these sentences rest on was re-measured on codex-cli 0.155.1 on 2026-09-30 and
    // failed as stated: the hooks feature is on by default, a project-file `hooks = false` did not
    // turn it off under the per-invocation trust override, and `codex exec` ran no project hook in
    // 3 of 3 runs with the cause not isolated. Each site keeps its 0.154.0 history and adds that
    // result, and none may say again that the project file's key was measured to be read.
    // TEST CHANGE, justified (2026-10-14, plan 020 file 1, unit d4-docs-site): two sites left with
    // the plugin route, `docs/plugins.md` (deleted here) and `scripts/plugins/clients/codex.mjs`
    // (deleted by unit d5-scripts-trees). The seven that remain are held exactly as before.
    const sites = [
      TROUBLESHOOTING,
      CUSTOMIZATION,
      SECURITY,
      CLIENT_CONTRACTS,
      GETTING_STARTED,
      CAPABILITY_MATRIX,
      "scripts/qa/hook-runs.mjs",
    ];
    for (const site of sites) {
      const text = read(site).replace(/\s+/g, " ");
      expect(text, `${site} does not name the 0.155.1 measurement`).toContain("0.155.1");
      expect(text, `${site} does not keep the open question`).toContain("not isolated");
      expect(text, `${site} still says the key was measured to be read`).not.toMatch(
        /measurably read|measured on 2026-09-15 to flip the feature/,
      );
    }
    // No page tells a reader the vendor states no default, which 0.155.1 measured as on and the
    // hooks page read 2026-09-30 states ("Hooks are enabled by default.").
    for (const site of [TROUBLESHOOTING, CUSTOMIZATION, CLIENT_CONTRACTS]) {
      expect(read(site).replace(/\s+/g, " "), site).not.toMatch(
        /the vendor states no default|Neither page states a default/,
      );
    }
    expect(read(CLIENT_CONTRACTS).replace(/\s+/g, " "), "the hooks page's default is not quoted").toContain(
      "Hooks are enabled by default.",
    );
    // The 2026-09-30 exec probe was recorded for the hooks page only; the config reference's read
    // that day covered the key, not exec, so no page credits it with the exec silence.
    const hookRuns = read("scripts/qa/hook-runs.mjs").replace(/\s+/g, " ");
    expect(hookRuns, "hook-runs credits every vendor page with the 2026-09-30 exec probe").not.toMatch(
      /vendor pages read 2026-09-30|read 2026-09-15 and again 2026-09-30/,
    );
  });

  it("says Claude Code reads AGENTS.md only through the bridge import, and never .agents/skills/", () => {
    // Claude Code 2.1.277+ reads `AGENTS.md` where no `CLAUDE.md` exists, and "anything under a
    // `.agents/` directory" is on its not-read list (code.claude.com/docs/en/memory, accessed
    // 2026-09-30). "Reads neither" was stale.
    const text = read(CUSTOMIZATION).replace(/\s+/g, " ");
    expect(text).not.toContain("Claude Code reads neither that tree nor `AGENTS.md`");
    expect(text).toContain("reads `AGENTS.md` only through the bridge import");
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

  it(
    "packs' worked example is what `add frontend --dry-run` prints over the shipped pack",
    async () => {
      // Plan 018 file 2, unit u17-docs (REQ-PACK-023): the install section's block is derived, never
      // typed. Every number in it (files, footprint, each file's size and token count, the context
      // cost, the scope rows, the pin prefix) is the real CLI's output over `packs/frontend/`, so an
      // edit to the pack that moves its pin or a size turns this red until the block is re-copied
      // from a fresh run. The whole block is compared line for line, the gate chain included.
      const page = read(PACKS_AND_TRUST).replace(/\r\n/g, "\n");
      const command = "```sh\nstamity add frontend --dry-run\n```";
      const at = page.indexOf(command);
      expect(at, "the packs guide never shows `stamity add frontend --dry-run`").toBeGreaterThanOrEqual(0);
      const open = page.indexOf("```text\n", at + command.length);
      const close = page.indexOf("\n```", open + "```text\n".length);
      expect(open, "no text block follows the dry-run command").toBeGreaterThan(at);
      const block = page.slice(open + "```text\n".length, close);

      // The real bin over a fresh repository set up for all four clients, so the output carries no
      // "also targets" note. The src entry, not dist: the catalog reads `packs/` first either way,
      // and this case then needs no build.
      const fixture = await makeCliFixture({ git: true });
      try {
        const init = await fixture.run(["init", "--tools", "claude,cursor,copilot,codex", "--yes"]);
        expect(init.code, `init failed:\n${init.stderr}`).toBe(0);
        const dry = await fixture.run(["add", "frontend", "--dry-run"]);
        expect(dry.code, `add frontend --dry-run failed:\n${dry.stderr}`).toBe(0);
        const printed = dry.stdout.replace(/\r\n/g, "\n").split("\n");
        const first = printed.findIndex((line) => /^ {2}manifest {2,}/.test(line));
        const last = printed.indexOf("  nothing written (--dry-run)");
        expect(first, `the dry run printed no gate chain:\n${dry.stdout}`).toBeGreaterThanOrEqual(0);
        expect(last, `the dry run never said it wrote nothing:\n${dry.stdout}`).toBeGreaterThan(first);
        expect(block, "the packs guide's dry-run block is not what the CLI prints; re-copy it").toBe(
          printed.slice(first, last + 1).join("\n"),
        );
      } finally {
        await fixture.cleanup();
      }
    },
    180_000,
  );

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

  it("troubleshooting's pack-integrity row re-installs in the order the finding line prints", () => {
    // The row repeats `check`'s finding line in prose, so nothing moved it when
    // the line gained its delete-by-hand step: `clean --pack` now removes the
    // pack's client copies itself and keeps and names one it cannot prove, and
    // a kept copy left on disk collides with the re-added pack's. The order is
    // read out of the function that prints it, with the page's placeholders.
    const page = read(TROUBLESHOOTING);
    const row = /^\| `pack-integrity` \|.*$/m.exec(page)?.[0] ?? "";
    expect(row, "the troubleshooting guide has no pack-integrity row").not.toBe("");
    expect(row).toContain(packReinstallSteps("<id>", null, "<source>"));
    expect(row, "the row still says sync removes the copies clean --pack now removes").not.toMatch(
      /`sync` only removes the pack's client copies/,
    );
  });

  it("troubleshooting's list of the codes it names is the codes it names", () => {
    // The list is prose, so nothing moved it when a row started naming a new
    // code (review/22). The codes are read out of `ErrorCode`'s union, as the
    // probes above are read out of check.ts, and the page's named codes are
    // every backticked member of that set anywhere on it.
    const union = /export type ErrorCode =([^;]+);/.exec(read("src/types/errors.ts"))?.[1] ?? "";
    const codes = new Set([...union.matchAll(/"([A-Z_]+)"/g)].map((match) => match[1] ?? ""));
    expect(codes.size, "no error codes could be read out of src/types/errors.ts").toBeGreaterThanOrEqual(9);

    const page = read(TROUBLESHOOTING);
    const named = new Set(
      [...page.matchAll(/`([A-Z_]+)`/g)].map((match) => match[1] ?? "").filter((name) => codes.has(name)),
    );
    const sentence = /The codes this page names are ([^.]+)\./.exec(page)?.[1];
    expect(sentence, "the troubleshooting guide no longer lists the codes it names").toBeDefined();
    const listed = [...(sentence ?? "").matchAll(/`([A-Z_]+)`/g)].map((match) => match[1] ?? "");

    expect(listed.toSorted()).toEqual([...named].toSorted());
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

// ADDED 2026-10-18 (plan 021 file 2, unit v15-cloud-page; REQ-PROVE-043, REQ-PROVE-042, REQ-FLOW-113).
// The cloud guide is a hand page, so the bucket's properties above hold it: no vendor URL, a
// currency header, links that resolve. What these cases add is what only this page claims: each
// cloud's five steps, the run contract as the parser reads it, the GitHub Action's limits and what a
// pull request still changes on it, each client's answer to a person-only act, and the cloud facts
// the capability matrix's table holds. The release checklist's two cloud lines are pinned here too,
// since they keep this page's facts current.
describe("docs/cloud.md", () => {
  const cloudPage = (): string => read(CLOUD);

  /** The three clouds an unattended run can start on, each a `##` section of the page. */
  const CLOUD_SECTIONS: readonly string[] = [
    "## Claude Code on the web",
    "## Cursor's cloud agents",
    "## Copilot's cloud agent",
  ];

  /** The five steps each cloud's section walks, in this order. */
  const CLOUD_STEPS: readonly string[] = [
    "### Set it up",
    "### Protect the default branch",
    "### Secrets",
    "### Start a contract run",
    "### The morning walk",
  ];

  /** The fact a row of the cloud table states for one client and subject. */
  const cloudFact = (tool: string, subject: string) => {
    const row = CLIENT_CLOUD_FACTS.find((fact) => fact.tool === tool && fact.subject === subject);
    expect(row, `CLIENT_CLOUD_FACTS has no ${tool} "${subject}" row`).toBeDefined();
    return row as (typeof CLIENT_CLOUD_FACTS)[number];
  };

  /** The duration a fact states (`59 minutes`, `6 hours`), read off the fact itself. */
  const durationOf = (fact: string): string => {
    const found = /\b(\d+) (minutes|hours)\b/.exec(fact)?.[0];
    expect(found, `the fact states no duration: "${fact.slice(0, 80)}…"`).toBeDefined();
    return found ?? "";
  };

  it("gives each cloud its setup, branch protection, secrets, contract start and morning walk", () => {
    const text = cloudPage();
    for (const heading of CLOUD_SECTIONS) {
      const section = sectionOf(text, heading);
      expect(section, `${CLOUD} has no "${heading}" section`).not.toBe("");
      const at = CLOUD_STEPS.map((step) => lines(section).indexOf(step));
      for (const [index, step] of CLOUD_STEPS.entries()) {
        expect(at[index], `${heading} has no "${step}"`).toBeGreaterThan(-1);
      }
      expect(at, `${heading}'s steps are out of order`).toEqual(at.toSorted((a, b) => a - b));
      // Branch protection is a prerequisite, not advice: the pre-flight refuses without it.
      const protect = flowed(sectionOf(section, "### Protect the default branch"));
      expect(protect, `${heading} does not tie protection to the pre-flight`).toContain("`direct-push`");
      expect(protect, `${heading} does not say the run refuses without protection`).toMatch(/refuse/);
      // The run starts under its contract, checked first.
      expect(flowed(sectionOf(section, "### Start a contract run")), `${heading} starts no contract run`).toContain(
        "--contract",
      );
    }
  });

  it("states the run contract as the parser reads it, its example a contract that parses", () => {
    const section = sectionOf(cloudPage(), "## The run contract");
    expect(section, `${CLOUD} has no "## The run contract" section`).not.toBe("");
    const [example] = fencedBlocksOf(section, "yaml");
    expect(example, "the run contract section shows no yaml example").toBeDefined();
    const parsed = parseRunContract(example ?? "", CLOUD);
    expect(parsed.ok ? [] : parsed.problems, "the page's example is not a contract the parser accepts").toEqual([]);
    if (!parsed.ok) return;
    // Non-degenerate: every optional key is set, and one prerequisite is owned by a named owner.
    const { contract } = parsed;
    expect(contract.plan).toBeDefined();
    expect(contract.item).toBeDefined();
    expect(contract.budget.stopBy).toBeDefined();
    expect(contract.budget.maxUnits).toBeGreaterThan(0);
    expect(contract.scope.in.length).toBeGreaterThan(0);
    expect(contract.scope.out.length).toBeGreaterThan(0);
    expect(contract.prerequisites.map((entry) => entry.state).toSorted()).toEqual(["done", "owned"]);

    // The prose names every key the parser takes, the two fixed values and the start check.
    const prose = flowed(section);
    for (const key of [
      "run-contract",
      "plan",
      "item",
      "base",
      "acceptance",
      "scope",
      "prerequisites",
      "budget",
      "stop-by",
      "max-units",
      "answerer",
      "preview",
      "move",
    ]) {
      expect(prose, `the run contract section does not name \`${key}\``).toContain(`\`${key}`);
    }
    expect(prose).toContain("`preview: stop`");
    expect(prose).toContain("`move: off`");
    expect(prose).toContain("stamity plan check");
    expect(prose).toContain("--contract");
    for (const code of ["`contract`", "`prerequisite-open`", "`contract-mismatch`"]) {
      expect(prose, `the run contract section does not name the blocker ${code}`).toContain(code);
    }
    expect(section, "the run contract section states no outputs").toContain("### What a run leaves");
    expect(section, "the run contract section states no failure modes").toContain("### When it stops");
  });

  it("names the GitHub Action a short surface, and what a pull request still changes there", () => {
    const section = flowed(sectionOf(cloudPage(), "## Claude Code's GitHub Action"));
    expect(section, `${CLOUD} has no "## Claude Code's GitHub Action" section`).not.toBe("");
    const cap = cloudFact("claude", "GitHub Action job cap");
    expect(section, "the Action's job cap is not the table's").toContain(durationOf(cap.fact));
    expect(section).toContain(`(${cap.status})`);
    expect(section).toContain("never an overnight surface");
    const questions = cloudFact("claude", "GitHub Action questions");
    expect(section, "the Action's question fact does not carry the table's status").toContain(
      `(${questions.status})`,
    );
    // TEST CHANGE, justified (plan 021 file 2, units w6-claude-hooks-in-claude-dir and w7-action-pages;
    // REQ-FLOW-113, REQ-FLOW-104): Claude Code's hook entries run copies under `.claude/hooks/stamity/`
    // since w6 (`CLAUDE_HOOKS_DIR`, src/hooks/model.ts), inside the base-branch restore, so the page no
    // longer says a pull request can change what the guard runs; it says which copy the hooks run, what
    // the restore still leaves to the pull request (the `AGENTS.md` the base's `CLAUDE.md` imports, which
    // the Action's restore list omits, and the records the scripts read), the base that predates the
    // copies, and the Action's own named limit.
    expect(section).toContain(`\`${CLAUDE_HOOKS_DIR}/\``);
    expect(section).toMatch(/a pull request cannot change what the guard runs on its own Action run/);
    expect(section).not.toMatch(/a pull request can change what the guard runs/);
    // TEST CHANGE, justified (u5-hook-copies, plan 018 file 2, REQ-FLOW-113, REQ-FLOW-088): the generated copies
    // are no longer written, so the page says the upgrade's `sync` removes them (keeping an edited one), which copy
    // a session run by hand starts, and the window an upgrade pull request on a base older than 1.16.0 opens.
    expect(section).not.toMatch(/are still written/);
    expect(section).toMatch(/The older copies under `\.stamity\/generated\/hooks\/claude\/` are no longer written: the upgrade's `sync` removes each one still as it wrote it and keeps and names one you edited/);
    expect(section).toMatch(/a session run by hand where no hook ran starts `\.claude\/hooks\/stamity\/stamity-session-start\.mjs`/);
    // TEST CHANGE, justified (ledger row 2026-10-21_packs-rebuilt-02/review/9, the maintainer's decision
    // "Correct the docs, add one step"): the fail-closed tail exists only from 1.9.0 (SECURITY.md's guard row;
    // v1.8.0's and v1.9.0's test/adapters/claude.test.ts pins), so the window is stated by base version and a
    // base older than 1.9.0 gets the one upgrade step.
    expect(section).toMatch(
      /on a pull request whose base predates 1\.16\.0, the base's entries name the scripts that pull request's `sync` removed, so those hooks cannot start\. From a 1\.9\.0 to 1\.15\.x base, the guard's entry, failing closed, refuses every tool call on that Action run\. Before 1\.9\.0 the guard's entry has no fail-closed tail, so the guard does not run on that Action run/,
    );
    expect(section).toMatch(
      /For a base older than 1\.9\.0, upgrade through 1\.16\.0 first, whose settings already name the copies under `\.claude\/hooks\/stamity\/`, which stay, or keep the Action off that one upgrade pull request/,
    );
    // TEST CHANGE, justified (ledger row review/162): "holds only until the base branch carries a `sync`" had the
    // timing backwards; the restore covers Stamity's hooks only once the base carries that sync, and before it the
    // base's entries run the copies outside `.claude/` (SECURITY.md's Action residual). The pin refuses "until".
    expect(section).not.toMatch(/holds only until the base branch carries a `sync`/);
    // TEST CHANGE, justified (u5-hook-copies): the sentence names the copies by their folder, the generated ones
    // being gone; the timing it pins is unchanged.
    expect(section).toMatch(/All of this holds only once the base branch carries a `sync` that writes the copies under `\.claude\/hooks\/stamity\/`\. Before it, the base branch's entries run the scripts under `\.stamity\/generated\/hooks\/claude\/`/);
    expect(section).toContain("`AGENTS.md`");
    expect(section).toMatch(/that pull request's `AGENTS\.md`/);
    // TEST CHANGE, justified (ledger row review/163): the session start also reads the resumable handoffs under
    // `.stamity/handoffs/` (src/hooks/scripts.ts, `handoffsDir`), which the restore leaves to the pull request too.
    expect(section).toMatch(/the run records, the learnings and the resumable handoffs under `\.stamity\/`, are that pull request's too/);
    expect(section).toMatch(/A pull request that changes `\.claude\/` sees that change reverted on the Action's run/);
    expect(section).toContain("`git add -A`");
    // w6's security lens (10:09Z): the restore covers Stamity's own hook scripts alone; user and pack hook rows run
    // scripts at their own paths outside `.claude/` (src/emit/hooksInfra.ts, the user and pack lanes).
    expect(section).toMatch(/Stamity's own hooks run the base branch's scripts/);
    expect(section, "a page says every hook script is the base branch's, user and pack hooks included").not.toMatch(/the scripts the hooks run are the base branch's/);
    expect(section).toMatch(/hooks of your own and hooks a pack supplies[^.]*run scripts outside `\.claude\/`[^.]*come from the pull request/);
    expect(section).toMatch(/keep such scripts under `\.claude\/`, or drop them/);
  });

  it("states each client's answer to a person-only act, as the guard gives it", () => {
    const section = flowed(sectionOf(cloudPage(), "## What asks, and what refuses"));
    expect(section, `${CLOUD} has no "## What asks, and what refuses" section`).not.toBe("");
    expect(section).toMatch(/Claude Code asks for one click/);
    // TEST CHANGE, justified (plan 021 file 2, units w4-copilot-ask and w5-ask-pages; REQ-FLOW-123): Copilot CLI asks
    // for the person's own agent since w4 (src/hooks/scripts.ts, attendedAsk's Copilot copy), so the page names it
    // beside Claude Code, with its assisted-mode residual, and Cursor and Codex refuse; the phrases that said Copilot
    // CLI refuses for want of a calling agent are gone.
    expect(section).toMatch(/Attended, Copilot CLI asks too, for your own agent alone/);
    expect(section).toMatch(/Copilot CLI 1\.0\.98 showed its hook permission dialog and waited for the person \(measured 2026-10-19\)/);
    expect(section).toMatch(/assisted mode can hand the ask to an LLM judge, which may approve it without you/);
    expect(section).toMatch(/Cursor and Codex refuse/);
    expect(section).not.toMatch(/Copilot CLI, Cursor and Codex refuse/);
    expect(section).not.toMatch(/names no calling agent/);
    expect(section).toMatch(/every deletion and every force push is refused on every client/i);
    expect(section).toMatch(/asks nothing/);
    expect(section).toContain("`stamity run checkpoint`");
    expect(section).toContain("`stamity run end`");
    // Added (whole-branch review M-4, review/176; REQ-FLOW-144): the skill runs no land on a blocked or refused exit
    // (`content/skills/st-unattended/SKILL.md`, the ending's step 4), so the page does not promise one after every end.
    expect(section).toContain("After `run end`, when the morning list holds no blocked or refused item, it runs `stamity run land --ready`");
  });

  it("states the cloud facts the capability matrix's table holds", () => {
    const text = flowed(cloudPage());
    const sessionLimit = cloudFact("copilot", "Session limit");
    expect(text, "Copilot's session limit is not the table's").toContain(durationOf(sessionLimit.fact));
    expect(cloudFact("claude", "Session marker").fact).toContain("`CLAUDE_CODE_REMOTE`");
    expect(text).toContain("`CLAUDE_CODE_REMOTE`");
    expect(cloudFact("copilot", "Default branch").fact).toContain("default branch");
    expect(flowed(sectionOf(cloudPage(), "## Copilot's cloud agent"))).toMatch(/on the default branch/);
    // REQ-FLOW-117: the opening a reader chooses from promises a night with nobody there on Claude Code and Cursor
    // only, and says Copilot's runs as a chain of sessions a person continues (review/107).
    const opening = flowed(cloudPage().split("\n## ")[0] ?? "");
    expect(opening).toMatch(/On Claude Code on the web and Cursor's cloud agents it can run through a night with nobody there/);
    expect(opening).toMatch(/Copilot's cloud agent runs it as a chain of sessions[^.]*a person continues each one/);
    // The `direct-push` wall's identity half (src/runs/preflight.ts, `pushIdentityCheck`): gh present, its helper
    // alone, no Authorization header, or Claude Code's proxy (review/106).
    const needs = flowed(sectionOf(cloudPage(), "## What every cloud needs"));
    expect(needs).toMatch(/needs `gh` installed and signed in/);
    expect(needs).toMatch(/gh's credential helper the only helper for origin and no `Authorization` extra header/);
    expect(text, "the page does not send the reader to the dated table").toContain("(capability-matrix.md)");
  });

  it("puts the cloud cadence on the release checklist: the vendor pages re-read, each client's ask re-measured", () => {
    const further = perReleaseLines().filter((line) => line.startsWith("A further line"));
    const vendor = further.find((line) => /re-read the vendor pages/.test(collapsed(line)));
    // `--require-observation` makes an unmeasured Claude Code (`not-installed`) exit 1, as `not-run` already does,
    // so the cut cannot pass the line with the attended ask unmeasured (review/105).
    const ask = further.find((line) => line.includes("`node scripts/qa/hook-runs.mjs --ask --require-observation`"));
    expect(vendor, `${RELEASE_CHECKLIST} has no line re-reading the cloud's vendor pages`).toBeDefined();
    expect(ask, `${RELEASE_CHECKLIST} has no line running hook-runs.mjs --ask --require-observation`).toBeDefined();
    for (const line of [vendor ?? "", ask ?? ""]) {
      expect(line, `a cloud line names no trigger: "${line.slice(0, 60)}…"`).toContain("Runs when:");
    }
    const vendorText = collapsed(vendor ?? "");
    expect(vendorText).toContain("`CLIENT_CLOUD_FACTS`");
    expect(vendorText).toMatch(/re-owes that cloud's person row/);
    const askText = collapsed(ask ?? "");
    for (const status of ["`held`", "`ran`", "`not-run`", "`not-installed`"]) {
      expect(askText, `the ask line does not name the status ${status}`).toContain(status);
    }
    expect(askText).toContain("machine lock");
    // TEST CHANGE, justified (plan 021 file 2, units w4-copilot-ask and w5-ask-pages, ledger rows build/82 and
    // review/150): w4 made Copilot CLI ask-class again (`ASK_CLASS_CLIENTS` in scripts/qa/hook-runs.mjs), so the
    // pin and the checklist's sentence name both clients, and the line states that `--require-observation`, which
    // it passes, makes a missing Copilot CLI hold the tag as a missing Claude Code does.
    // The ask-class clients the script measures, read from the script itself.
    expect(ASK_CLASS_CLIENTS).toEqual(["claude", "copilot"]);
    expect(askText).toMatch(/Claude Code and Copilot CLI are the ask-class clients it measures/);
    expect(askText).not.toMatch(/Claude Code is the one ask-class client/);
    expect(askText).toMatch(/moves to refusing before the tag/);
    expect(askText).toMatch(/`not-run`[^.]*`not-installed`[^.]*each exit 1 and hold the tag/);
    expect(askText).toContain(
      "`not-installed`, no Claude Code or no Copilot CLI on the machine (red under `--require-observation`, which this line passes)",
    );
    // The person's interactive check covers each ask-class client: Claude Code's approve prompt and Copilot CLI's
    // hook permission request, each declined (reports/w4-measure-r1.md, P3a-a).
    const interactive = further.find((line) => /one-minute check/.test(collapsed(line)));
    expect(interactive, `${RELEASE_CHECKLIST} has no one-minute interactive check line`).toBeDefined();
    const interactiveText = collapsed(interactive ?? "");
    expect(interactiveText).toContain("for each ask-class client");
    expect(interactiveText).toContain("see Claude Code's own approve prompt appear; decline it");
    expect(interactiveText).toContain("`node <the cut's checkout>/dist/cli.js init --tools copilot --yes`");
    expect(interactiveText).toContain("open an interactive Copilot CLI session with Allow All on (`copilot --yolo`)");
    expect(interactiveText).toContain("see its hook permission request appear; decline it");
    expect(interactiveText).toContain("moves that client to refusing");
    expect(interactiveText).toContain("Runs when:");
  });

  // ADDED 2026-10-19 (plan 021 file 2, unit w5-ask-pages; REQ-FLOW-123): the Copilot cloud agent's morning walk says
  // why each held act comes as the exact command now that Copilot CLI's guard can ask: the cloud agent denies an ask,
  // as the research read Copilot's documentation on 2026-10-19 (the run record's 08:23Z entry).
  // TEST CHANGE, justified (plan 021 file 2, unit w5-ask-pages, ledger row review/156): the walk promised each held act
  // as the exact command, but a client-denied ask carries only the ask's text (`askSentence`, src/hooks/scripts.ts),
  // which names no command; only the guard's refusal (`GUARD_NO_CALLER`) tells the agent to give one. The page now says
  // what the person gets in each case.
  it("says what a held act on Copilot's cloud agent brings the person: the ask's text, or the refusal's exact command", () => {
    const walk = flowed(sectionOf(sectionOf(cloudPage(), "## Copilot's cloud agent"), "### The morning walk"));
    expect(walk).toContain("Copilot's documentation says its cloud agent denies a hook's ask, since nobody is there to click it");
    expect(walk).not.toContain("Copilot's guard refuses every person-only act rather than asking");
    expect(walk).not.toContain("so each held act comes to you as the exact command");
    expect(walk).toContain("so an act the guard asks for does not run there");
    expect(walk).toContain("The denied ask tells the agent only that the act is yours to approve, not to give you the command");
    expect(walk).toContain(
      "Where the guard refuses instead (a helper agent's call, or a session Copilot's session start did not record), the refusal tells the agent to give you the exact command",
    );
  });

  // ADDED 2026-10-19 (plan 021 file 2, unit w5-ask-pages, ledger row review/157): the release checklist's interactive
  // check runs for each ask-class client, Copilot CLI included, so the page's currency section names both sessions.
  it("names each ask-class client's one-minute interactive check in how the page stays current", () => {
    const current = flowed(sectionOf(cloudPage(), "## How this page stays current"));
    expect(current).toContain(
      "with a person's one-minute check of each ask-class client's interactive ask beside it, in an interactive Claude Code session and an interactive Copilot CLI session",
    );
    expect(current).not.toContain("one-minute check in an interactive Claude Code session beside it");
  });

  // ADDED 2026-10-20 (plan 021 file 2, unit n11-cloud-setup-page; REQ-PROVE-043): the first cloud checks, on
  // 2026-10-19 (the run record's 23:15Z entry), stopped at the pre-flight. Claude Code on the web ran Node 22.22.0,
  // below the engines floor (`node-engine`), and its git pushed over https with no credential helper (`direct-push`);
  // Cursor's origin push URL carried its own credentials (`direct-push`). Each cloud's "Set it up" names what its
  // environment needs. The floor the page names is read off `package.json`, so an engines move fails here.
  it("names what each cloud's setup needed at the first cloud checks: the Node floor, gh's helper, a plain origin", () => {
    const pkg = JSON.parse(read("package.json")) as { engines?: { node?: string } };
    const floor = /^>=\s*(\d+\.\d+\.\d+)$/.exec(pkg.engines?.node ?? "")?.[1];
    expect(floor, `package.json's engines.node is not a >= floor: ${pkg.engines?.node ?? "absent"}`).toBeDefined();
    const claude = flowed(sectionOf(sectionOf(cloudPage(), "## Claude Code on the web"), "### Set it up"));
    expect(claude).toContain(`The environment needs a Node of at least the CLI's engines floor, ${floor ?? ""}`);
    expect(claude).toContain(
      "on 2026-10-19 the cloud's own Node was 22.22.0, and the pre-flight's `node-engine` check refused it",
    );
    expect(claude).toContain(
      "run `gh auth setup-git` in the cloud environment before the run starts, so that `gh` is origin's credential helper",
    );
    expect(claude).toContain("by default git pushed origin over https with no credential helper, and `direct-push` refused");
    const cursor = flowed(sectionOf(sectionOf(cloudPage(), "## Cursor's cloud agents"), "### Set it up"));
    expect(cursor).toContain("The saved environment's origin URL must not carry credentials");
    expect(cursor).toContain(
      "set origin's URL, and its push URL where one is set, to the repository's plain https URL, then run `gh auth setup-git`",
    );
    expect(cursor).toContain(
      "on 2026-10-19 Cursor's origin push URL carried its own credentials, which cannot be tied to `gh`'s identity, and `direct-push` refused",
    );
  });
});

// ADDED 2026-10-19 (plan 021 file 2, unit w7-action-pages; REQ-FLOW-113, REQ-FLOW-104). Since w6 Claude Code's hook
// entries run copies under `.claude/hooks/stamity/` (`CLAUDE_HOOKS_DIR`), which the Claude Code GitHub Action replaces
// with the base branch's copy on a pull request. TEST CHANGE, justified (u5-hook-copies, plan 018 file 2,
// REQ-FLOW-088): the generated copies under `.stamity/generated/hooks/claude/` are no longer written, the manual
// session start running the copy, so the pages say they leave on the upgrade's `sync` and name the window an upgrade
// pull request on a base older than 1.16.0 opens. Each page line that names Claude's hook folder says which copy the hooks run, and the
// security page's Action residual narrows to what the restore leaves: `AGENTS.md`, which the Action's restore list
// (`SENSITIVE_PATHS`, read at the Action's commit 5eb090f3 on 2026-10-19) omits, the records the scripts read, a base
// that predates the copies, and the Action's own named limit. The folder is read from the source, not restated.
describe("the Action's restore covering Claude Code's hook copies (w7-action-pages)", () => {
  const copies = `\`${CLAUDE_HOOKS_DIR}/\``;
  /** One `- **<title>**` bullet of a page, flowed, up to the next bullet or heading. */
  const bulletOf = (text: string, title: string): string => {
    const from = text.indexOf(`- **${title}**`);
    expect(from, `no "${title}" bullet`).toBeGreaterThanOrEqual(0);
    const rest = text.slice(from + 1);
    const ends = [rest.indexOf("\n- **"), rest.indexOf("\n#")].filter((at) => at >= 0);
    return flowed(rest.slice(0, ends.length === 0 ? undefined : Math.min(...ends)));
  };

  it("SECURITY.md's Action residual names the copies inside the restore and what stays with the pull request", () => {
    const bullet = bulletOf(read(SECURITY), "Claude Code's GitHub Action on a pull request.");
    expect(bullet).toContain(copies);
    expect(bullet).toContain("`src/hooks/model.ts::CLAUDE_HOOKS_DIR`");
    expect(bullet).toMatch(/a pull request cannot change what the guard runs on its own Action run/);
    expect(bullet, "the bullet still says the pull request supplies the hook scripts").not.toMatch(
      /the hook scripts those settings start, under `\.stamity\/generated\/hooks\/`, and the `AGENTS\.md`/,
    );
    expect(bullet).toMatch(/`AGENTS\.md` that `CLAUDE\.md` imports is not among the paths the Action restores/);
    // TEST CHANGE, justified (ledger row review/163): the resumable handoffs the session start reads join the list.
    expect(bullet).toMatch(/run records, learnings and resumable handoffs under `\.stamity\/` that those scripts read/);
    expect(bullet).toMatch(
      /until the base branch carries a `sync` that writes the copies, its hook entries run the scripts under `\.stamity\/generated\/hooks\/claude\/`, which come from the pull request/,
    );
    // ADDED (u5-hook-copies, REQ-FLOW-113): the old copies leave on the upgrade's `sync`, and the window that opens.
    expect(bullet).toMatch(/Those old copies are gone after the upgrade's `sync`, which no longer writes them/);
    // TEST CHANGE, justified (ledger row 2026-10-21_packs-rebuilt-02/review/9, the maintainer's decision): the
    // window is exact by base version, since releases before 1.9.0 wrote the guard entry with no fail-closed
    // tail, and a base older than 1.9.0 gets the one upgrade step.
    expect(bullet).toMatch(
      /on an upgrade pull request whose base predates 1\.16\.0 the base's entries name scripts that pull request removed, so those hooks cannot start\. From a 1\.9\.0 to 1\.15\.x base, the guard's entry, failing closed, refuses every tool call on its Action run until it merges\. Before 1\.9\.0 the guard's entry has no fail-closed tail, so the guard does not run on that Action run and its tool calls go through unchecked/,
    );
    expect(bullet).toMatch(
      /a base older than 1\.9\.0 upgrades through 1\.16\.0 first, whose settings already name the copies under `\.claude\/hooks\/stamity\/`, which stay, or keeps the Action off that one upgrade pull request/,
    );
    expect(bullet).toMatch(/a pull request that changes `\.claude\/` sees that change reverted on its Action run/);
    expect(bullet).toContain("`git add -A`");
    expect(bullet).toMatch(/the engine's own hook scripts are the base branch's/);
    expect(bullet, "a page says every hook script is the base branch's, user and pack hooks included").not.toMatch(/the scripts the hooks run are the base branch's/);
    expect(bullet).toMatch(/user and pack hook scripts the settings run from outside `\.claude\/` come from the pull request/);
    expect(bullet).toMatch(/keeps such scripts under `\.claude\/` or drops them/);
  });

  it("SECURITY.md's hook execution row names the folder Claude Code's hooks run from", () => {
    const row = bulletOf(read(SECURITY), "Hook and MCP execution.");
    expect(row).toMatch(
      new RegExp(`Reading \`\\.stamity/generated/hooks/\` and \`${CLAUDE_HOOKS_DIR.replaceAll(".", "\\.")}/\``),
    );
    expect(row).toMatch(/where the copies Claude Code's hook entries run live/);
  });

  it("troubleshooting shows the guard command Claude Code runs, at the copy", () => {
    const page = read(TROUBLESHOOTING);
    const commands = page.split("\n").filter((line) => line.startsWith('"command": "node'));
    expect(commands, "the troubleshooting guide shows no guard command").toHaveLength(1);
    expect(commands[0]).toContain(`\${CLAUDE_PROJECT_DIR}/${CLAUDE_HOOKS_DIR}/stamity-pre-tool-use-guard.mjs`);
    expect(flowed(page)).toContain(`With it empty the path resolves to \`/${CLAUDE_HOOKS_DIR}/…\``);
    expect(flowed(page)).toMatch(
      /The entry runs the copy under `\.claude\/hooks\/stamity\/`, not the one under `\.stamity\/generated\/hooks\/claude\/`/,
    );
    // ADDED (u5-hook-copies, REQ-FLOW-088): the old copy is no longer written, and the hand-run session start is the copy.
    expect(flowed(page)).toMatch(/`\.stamity\/generated\/hooks\/claude\/`, which is no longer written/);
    expect(flowed(page)).not.toMatch(/which is still written for the session start/);
    expect(flowed(page)).toMatch(/The session start you run by hand where no hook ran is the copy under `\.claude\/hooks\/stamity\/` too/);
    // ADDED (ledger row 2026-10-21_packs-rebuilt-02/review/9, the maintainer's decision): the upgrade window is
    // stated by base version, and a base older than 1.9.0 gets the one upgrade step.
    expect(flowed(page)).toMatch(
      /From a 1\.9\.0 to 1\.15\.x base it refuses every tool call on that run until the upgrade merges; before 1\.9\.0 it has no fail-closed tail, so the guard does not run on that run/,
    );
    expect(flowed(page)).toMatch(/For a base older than 1\.9\.0, upgrade through 1\.16\.0 first/);
    expect(flowed(page), "the page says every pre-1.16.0 base fails closed").not.toMatch(
      /predates 1\.16\.0 the base's entry names the removed old copy, so it refuses every tool call/,
    );
  });

  // TEST CHANGE, justified (u5-hook-copies, REQ-FLOW-088): the generated Claude guard is no longer written, so the
  // line names the copy as the guard the script times rather than as a twin of the generated one.
  it("the hook-latency line names the guard copy the hooks run as the guard it times", () => {
    const line = read(RELEASE_CHECKLIST)
      .split("\n")
      .find((text) => text.includes("`node scripts/hook-latency.mjs`"));
    expect(line, `${RELEASE_CHECKLIST} has no hook-latency line`).toBeDefined();
    expect(line).toContain(`the guard the script times (\`${CLAUDE_HOOKS_DIR}/stamity-pre-tool-use-guard.mjs\`, the copy Claude Code's hook entries run`);
    expect(line).toMatch(/the generated Claude guard, which `sync` no longer writes/);
    expect(line).not.toMatch(/differs from it only/);
  });

  describe("docs/specs/everyday-flows.md", () => {
    const SPEC = "docs/specs/everyday-flows.md";
    const spec = read(SPEC);
    const requirement = (id: string): string => {
      const from = spec.indexOf(`### ${id} `);
      expect(from, `${SPEC} has no ${id} heading`).toBeGreaterThanOrEqual(0);
      const to = spec.indexOf("\n### REQ-", from + 1);
      return flowed(spec.slice(from, to === -1 ? undefined : to));
    };
    /** The flowed `Amended 2026-10-19 (... w7-action-pages ...)` bullet, which must sit before the Proof line. */
    const w7Amendment = (id: string): string => {
      const text = requirement(id);
      const from = text.indexOf("- **Amended 2026-10-19** (plan 021 file 2, units `w6-claude-hooks-in-claude-dir`");
      expect(from, `${id} has no w6/w7 "Amended 2026-10-19" bullet`).toBeGreaterThanOrEqual(0);
      const proof = text.indexOf("- **Proof:**", from);
      expect(proof, `${id}'s w6/w7 bullet does not come before its Proof line`).toBeGreaterThan(from);
      return text.slice(from, proof);
    };

    it("REQ-FLOW-113 states the copies inside the restore and the Action's own limit", () => {
      const bullet = w7Amendment("REQ-FLOW-113");
      expect(bullet).toContain(copies);
      // TEST CHANGE, justified (plan 018 file 2, unit u18-spec; REQ-FLOW-113, REQ-FLOW-088): u5-hook-copies stopped
      // emitting the generated copies, and the spec merge rewrote the bullet's sentence in place, so the pin reads the
      // merged sentence where it read "no hook entry runs them", and refuses the old sentence standing live (its quote
      // inside the amendment note ends on a quotation mark, not on the configuration-row sentence).
      expect(bullet).toContain(
        "The copies under `.stamity/generated/hooks/claude/` are no longer emitted, and a session run by hand starts " +
          "`.claude/hooks/stamity/stamity-session-start.mjs`",
      );
      expect(bullet).not.toMatch(/no hook entry runs them\. The configuration row/);
      expect(bullet).toMatch(/a pull request no longer changes what the guard runs on its own Action run/);
      expect(bullet).toContain("`git add -A`");
      expect(bullet).toMatch(/user and pack hook scripts outside `\.claude\/`/);
    });

    it("REQ-FLOW-104 narrows the Action residual to what the restore leaves", () => {
      const bullet = w7Amendment("REQ-FLOW-104");
      expect(bullet).toMatch(/`AGENTS\.md`/);
      expect(bullet).toMatch(/run records and learnings/);
      expect(bullet).toMatch(/a base branch that predates the copies/);
      expect(bullet).toContain("`git add -A`");
      expect(bullet).toMatch(/user and pack hook scripts outside `\.claude\/`/);
    });

    it("the lines naming Claude Code's hook folder say which copy the hooks run", () => {
      expect(requirement("REQ-FLOW-001")).toContain(`the copies Claude Code's hook entries run under ${copies}`);
      // TEST CHANGE, justified (plan 018 file 2, unit u18-spec; REQ-FLOW-088): invariant 5 now names the client's own
      // folder and `sync` no longer writes Claude Code's generated copies (u4-charter, u5-hook-copies), so the merged
      // sentence names the copy and the stopped emission where it read "the generated copy the invariant names is
      // still written"; that sentence survives only as the quoted text of the amendment note.
      // TEST CHANGE, justified (2026-10-22, the whole-branch fix round, review/52): invariant 5 no longer names
      // `.<client>/hooks/stamity/` where that folder exists; it names the script the client's own hook entries name in
      // its held hook settings, so the merged sentence says that, and the folder sentence survives only as quoted text.
      const flow088 = requirement("REQ-FLOW-088");
      expect(flow088).toMatch(
        /Claude Code's hook entries run the copy under `\.claude\/hooks\/stamity\/`; since plan 018 file 2, the invariant names the script a client's own hook entries name, never a folder found to exist, and `sync` stops emitting `\.stamity\/generated\/hooks\/claude\/`/,
      );
      expect(flow088).not.toMatch(/`\.claude\/hooks\/stamity\/`; the generated copy the invariant names is still written/);
      expect(flow088).not.toMatch(/the invariant names that folder for a client that has one, and `sync` stops emitting/);
      expect(requirement("REQ-FLOW-064")).toContain(`\`${CLAUDE_HOOKS_DIR}/stamity-review-gate.mjs\``);
    });
  });
});

// ADDED 2026-10-25 (plan 022 file 1, unit a16-security-pages; REQ-FLOW-145, with REQ-FLOW-036, REQ-FLOW-102 and
// REQ-FLOW-104 as built). The four security pages state the autonomy model the guard, the land verb and the setting
// build (src/hooks/personOnly.ts::personOnlyVerdict, src/runs/landEvidence.ts::decideLand,
// src/config/autonomy.ts::resolveAutonomy), SECURITY.md carries each unit's sentence with its residuals, the
// troubleshooting page gives the land verb's reasons as the verb words them, and the close says it lands through the
// verb. Each pin fails on the integration head 89e088f9, whose pages say none of it.
describe("the security pages state the autonomy model (REQ-FLOW-145)", () => {
  it.each([SECURITY, SECURITY_MAPPING, CLOUD, TROUBLESHOOTING])(
    "%s names the land verb, its evidence, the setting, the deploying lists and the raw acts that still ask",
    (page) => {
      const flat = flowed(read(page));
      expect(flat, `${page} does not name the land verb`).toMatch(/`stamity run land[` ]/);
      // The evidence: check runs on the exact head, statuses never counted, threads, the ledger, protection.
      expect(flat).toContain("commit statuses do not count");
      expect(flat).toMatch(/exact head/);
      expect(flat).toMatch(/no unresolved review thread|no review thread is unresolved/);
      expect(flat).toContain("Critical or Warning");
      expect(flat).toContain("required human review");
      // The setting that tightens back, and how a repository names what deploys.
      expect(flat).toContain("`autonomy.mode`");
      expect(flat).toContain("`autonomy.deployingBranches`");
      expect(flat).toContain("`autonomy.deployingActs`");
      // A raw merge and a raw push to the default branch stay the person's.
      expect(flat).toMatch(/raw merge/);
      expect(flat).toContain("raw push to the default branch");
    },
  );

  it("SECURITY.md carries each unit's sentence and the residual it names", () => {
    const flat = flowed(read(SECURITY));
    for (const claim of [
      // a4: the setting, the ask list, status writes, the land line and its approval.
      "In mode `autonomous`, the default, the main thread's ready-for-review mark on the origin's own repository, a local tag and a workflow dispatch run unasked unless `autonomy.deployingActs` names them",
      "A raw ready mark stays refused while a run is unattended",
      "A commit status or a check run is refused in every mode (`status-write`)",
      "asks in every mode (`land-approved`), so it is refused unattended and for a sub-agent",
      "baked into every guard copy as a `// stamity-autonomy` marker line",
      // a5: the 64 KiB cap, the data sinks and their residuals.
      "A command line longer than 65,536 characters is refused in every mode before any reading (`line-too-long`)",
      "A heredoc body the guard reads as data is not read for acts",
      "A file written this way and run later, by another call or by a line that does not name it, is not read either",
      // a4c, with the two corrections decided for it, and the host residual.
      "And in any mode a sub-agent can move the origin by writing the git configuration file directly, since the guard reads shell calls only: with a file tool, a redirect or a symbolic link, the global or XDG file outside the repository included",
      // Fix round 3 (a4-security-r13): on the identity-free clients the write is every call's, the remote rule holds
      // the URL-rewrite and include writes, and re-pointing the origin's HEAD ref is no person-only act.
      "On Codex and Cursor, whose payloads name no agent, that write is open to every call, not only a sub-agent's",
      "and a remote, URL-rewrite or include write are refused on them in every mode too",
      "Re-pointing that ref with a ref write, or turning it into a plain ref, is not read as a person-only act on any client",
      "a later attended push to the real default branch read as a push of another branch, and that push runs without asking",
      "on a gh version other than 2.102.0",
      "the guard does not read gh's own configured default host",
      "A body read from a file is not screened for mentions",
      // a4b: the hooks-off layer and the forged ledger record.
      "That leaves no layer at all for a sub-agent's ready mark or tag",
      "a forged record that lists an owner's own ready-mark or local-tag ask row makes `sync` remove it",
      // a7: the fail-closed tail on a timeout.
      "measured on Claude Code 2.1.309 (2026-10-23), a guard that times out blocks the call",
      "Copilot CLI 1.0.100, which reads the same file's hooks, loads the entries and ignores the key (measured)",
      // a10: a Codex verdict role's read-only.
      "a verdict role's read-only grant there is an instruction, not a boundary",
      "refused only by that tool's own policy",
      // a2: the configuration window and the refused ending.
      "`run checkpoint`, `run end` and `run land` compare three things with the salted digest that `gate preflight --unattended` recorded",
      "A record marked `refused` is accepted only by `run end --refused`",
      // a1: the held patch's prefixes.
      "The held patch pins git's `a/` and `b/` prefixes",
      "under a top folder named `a`, `b`, `c`, `i`, `w`, `o`, `1` or `2`, still reads as prefixed",
      // a3b: the loosen gate and its residuals.
      "refuse with `AUTONOMY_LOOSENED`, exit 1 and nothing written",
      "A commit or a checkout that moves `HEAD`",
      "a fresh clone, a switch of every selected client or a hooks layout move there costs one `--loosen` by design",
      // a6: the land verb's row, its network sentence and replace refs.
      "Only `stamity run land` marks the run's own pull request ready and merges it, and only on its evidence",
      "**`stamity run land` belongs to the third exception.**",
      "`os.tmpdir()`, one of the temp folders, follows `TMPDIR`",
      "a `gh` that a version manager pins only in the repository's own version file no longer resolves from the root",
      "On a single-account repository the run's login is the person's, so neither the author check nor the thread check can tell them apart, and the review loop is the evidence of record",
      "A repository's CI may choose which checks run with code the change edits",
      "`GIT_NO_REPLACE_OBJECTS=1` and the command-line key `-c core.useReplaceRefs=false`",
      // Fix round 1 (review/150, 156-158, 161, 162): the trees that land on the evidence, the run's own ledger, the
      // clients whose payload names no agent, the unattended tag and dispatch, and the record-head gap.
      "other than the charter, the rule files and the agent, command, skill, prompt and chat-mode definitions under each client's folder",
      "the instructions every later session follows among them, and the review loop is their only reader",
      "The ledger it checks is a file the run itself writes and commits, so an empty or rewritten ledger passes: the review loop and the whole-branch review are the evidence of record",
      // TEST CHANGE, justified (plan 022 file 1, unit a16-security-pages, fix round 2, the lens's two wording points;
      // REQ-FLOW-145): 1.16.0 refused only the ready mark and a local tag on Cursor and Codex (the dispatch and
      // remote-write rules are this release's), and unattended a tag and a dispatch run only where the payload names
      // the agent, so both pins move to the wording that says so.
      "while on Cursor and Codex, whose hook payloads name no agent, no call can be shown to be the main thread's, so they are refused in every mode (1.16.0 refused the ready mark and a local tag there too, and the dispatch and remote-write rules are new in this release). `stamity run land` alone on its line runs on every client",
      "Unattended, of these acts only the raw ready mark is refused on Claude Code and Copilot CLI: a local tag and an unnamed workflow dispatch run there too, while Cursor and Codex refuse all three in every mode",
      "is refused for a sub-agent, and on Cursor and Codex in every mode",
      "a local tag and a workflow dispatch the setting does not name run unasked; Cursor and Codex refuse those three in every mode",
    ]) {
      expect(flat, `SECURITY.md does not state: ${claim}`).toContain(claim);
    }
    for (const stale of [
      "No run verb marks a pull request ready, merges it or tags",
      "The attended guard's accepted gaps.",
      "removes no `permissions.deny` row and no `permissions.ask` row",
      "The charter, rule and agent-definition files land on the evidence",
      "other than the charter, rule and agent-definition files",
      "`src/cli/commands/run.ts::hookPathsAt`",
    ]) {
      expect(flat, `SECURITY.md says again: ${stale}`).not.toContain(stale);
    }
  });

  // Fix round 1 (review/150, 157): the trees the land verb lands on the evidence are exactly the code's, so the land row
  // names each kind `LANDS_ON_EVIDENCE` holds; and the mapping carries the same list and the identity-free clients.
  it("the land row names every kind of tree that lands on the evidence, and the mapping says the same", () => {
    const evidence = read("src/runs/landEvidence.ts");
    const list = /export const LANDS_ON_EVIDENCE[^=]*=\s*\[([^\]]*)\]/.exec(evidence)?.[1] ?? "";
    const globs = [...list.matchAll(/"([^"]+)"/g)].map((match) => match[1] ?? "");
    expect(globs.length, "LANDS_ON_EVIDENCE could not be read").toBeGreaterThan(10);
    // Each glob is one of the kinds the page names: a charter, a rule file, or an agent, command, skill, prompt or chat-mode tree.
    const kind = (glob: string): string | null =>
      /AGENTS(\.override)?\.md|CLAUDE\.md/.test(glob) ? "the charter"
        : /rules|instructions/.test(glob) ? "the rule files"
          : /\/agents\//.test(glob) ? "agent" : /\/commands\//.test(glob) ? "command" : /\/skills\//.test(glob) ? "skill"
            : /\/prompts\//.test(glob) ? "prompt" : /\/chatmodes\//.test(glob) ? "chat-mode" : null;
    for (const glob of globs) expect(kind(glob), `the page names no kind for ${glob}`).not.toBeNull();
    const phrase = "the charter, the rule files and the agent, command, skill, prompt and chat-mode definitions under each client's folder";
    for (const name of new Set(globs.map(kind))) expect(phrase, `the land row omits ${name}`).toContain(name ?? "");
    const security = flowed(read(SECURITY));
    const land = security.slice(security.indexOf("| An agent working on a change, attended or not"), security.indexOf("| An agent, or the text that steers it | Loosening"));
    expect(land).toContain(`other than ${phrase}`);
    const mapping = flowed(read(SECURITY_MAPPING));
    expect(mapping).toContain(`other than ${phrase}, which land on the evidence with the review loop their only reader`);
    expect(mapping).toContain("The ledger is a file the run itself writes and commits, so an empty or rewritten one passes");
    // TEST CHANGE, justified (plan 022 file 1, unit a16-security-pages, fix round 3, a4-security-r13; REQ-FLOW-134): a
    // remote write, a URL-rewrite write and an include write are one rule (src/hooks/personOnly.ts, `remoteWriteVerdict`),
    // so the mapping names all three where it lists what Cursor and Codex refuse.
    expect(mapping).toContain("on Claude Code and Copilot CLI and never for a sub-agent, while Cursor and Codex, whose payloads name no agent, refuse them and a remote, URL-rewrite or include write in every mode");
    expect(mapping).toContain("any call's on Codex and Cursor");
    expect(mapping).toContain("Re-pointing `origin/HEAD` with a ref write, or turning it into a plain ref, is no person-only act on any client");
    // TEST CHANGE, justified (fix round 2, the lens's second wording point; REQ-FLOW-145): unattended, a tag and a
    // dispatch run on Claude Code and Copilot CLI only, so the pin carries the clients.
    expect(mapping).toContain("and of the acts the setting runs only the raw ready mark: a local tag and an unnamed workflow dispatch run there too on Claude Code and Copilot CLI, Cursor and Codex refusing them in every mode");
    expect(flowed(read(SECURITY)), "SECURITY.md says again 1.16.0 refused every one of them").not.toContain("as 1.16.0 refused them");
    expect(mapping, "the mapping says again an unattended run refuses every person-only act").not.toContain("it refuses every person-only act on every client and also");
    expect(flowed(read(CLOUD))).toContain("Cursor and Codex refuse them in every mode, since their hook payloads name no agent");
  });

  it("troubleshooting gives the land verb's reasons as the verb words them, and the new entries", () => {
    const page = flowed(read(TROUBLESHOOTING));
    const verb = read("src/runs/landEvidence.ts") + read("src/cli/commands/runLand.ts") + read("src/runs/pullRequest.ts");
    for (const heading of [
      "### `run land` exits 1 and does not merge",
      "### `run land` cannot start a `gh` pinned only in the repository",
      "### `sync` exits 1 with `AUTONOMY_LOOSENED`",
      "### A settings row refuses a push, a tag or a merge chained with another command",
      "### Writes to your own repository ask, through an SSH host alias",
    ]) {
      expect(page, `troubleshooting has no entry: ${heading}`).toContain(heading);
    }
    // Added (whole-branch review W-1, review/172; REQ-FLOW-144): the guard asks on the approval line only where it can
    // ask; on Codex and Cursor it refuses that ask-class act (`src/hooks/personOnly.ts:184-187`), so the line goes to
    // the person.
    expect(page).toContain("On Claude Code's and Copilot CLI's main thread the guard asks on that line.");
    expect(page).toContain(
      "On Codex and Cursor the guard refuses it instead of asking, so the agent hands the person that exact line to run in their own terminal, and the merge stays held until they do.",
    );
    expect(page).not.toContain("The guard asks on that line, the flag holds");
    // Each reason the page quotes is the verb's own wording.
    for (const reason of [
      "autonomy.mode is ask",
      "the diff touches paths that define the evidence",
      "the diff carries a held patch",
      "is named in autonomy.deployingBranches",
      "autonomy.deployingActs names",
      "is still running",
      "has no check run yet",
      "did not pass",
      "holds open Critical or Warning rows",
      "mergeable_state is not computed yet, run it again",
      "the pull request is a draft",
      "the head moved since the approval",
      "gh not found on PATH",
      "failed before GitHub answered",
      // Fix round 1 (review/151): the record's refusals as `prRecordRefusal` words them.
      "no pull-request record",
      "the pull-request record names",
    ]) {
      expect(page, `troubleshooting does not quote: ${reason}`).toContain(reason);
      expect(verb, `the land verb no longer says: ${reason}`).toContain(reason);
    }
    expect(page).toContain("on a fresh clone, on a switch of every selected client, and on a hooks layout move");
    expect(page).toContain("Put a push, a tag or a merge alone on its line");
    expect(page).toContain("It applies git's URL rewrites, but not your SSH configuration");
    // Fix round 1 (review/155, 160, 152, 151): the alias's own SSH settings, the land verb's strictest setting, the record's verb.
    expect(page).toContain("a key or an account the alias chose no longer applies");
    expect(page).toContain("keeps it asking until that change reaches the default branch");
    expect(page).toContain("run `run checkpoint --pr` there, which pushes so `HEAD` and origin's tip agree and writes the record");
    expect(page, "troubleshooting quotes a reason the land verb does not print").not.toContain("(`pull request not recorded`)");
    // The settings entry: a raw merge keeps its ask row, and the rows no longer only grow (REQ-FLOW-036).
    expect(page).toContain("a raw merge keeps its row in every mode");
    expect(page).not.toContain("Those two lists only grow");
  });

  it("working with stamity says the close lands through the verb, and asks nothing about the commit", () => {
    const page = flowed(read(WORKING_WITH_STAMITY));
    expect(page).toContain("The commit is no question");
    expect(page).toContain("then runs `stamity run land --ready`, which marks it ready and merges it when the evidence holds");
    expect(page).not.toContain("whose recommended option commits");
  });
});

/**
 * review/10 (plan 022 file 2, unit b9-upgrade-verb): each page's list of the
 * verbs that start a selected client's own CLI names `upgrade`, which reads the
 * model lists through `sync`'s own reader (`src/cli/commands/upgrade.ts`,
 * `freshModelLists`). An operator who controls outbound traffic by that list
 * would otherwise run `upgrade` thinking it starts none.
 */
describe("the verbs that start a client's own CLI", () => {
  it.each([README, GETTING_STARTED, PACKS_AND_TRUST])("%s names upgrade among them", (page) => {
    const list = /`init`, `sync`[^.]*?start each\s+selected client's own CLI/.exec(flowed(read(page)));

    expect(list, `${page}: the list of verbs that start a client's own CLI was not found`).not.toBeNull();
    expect(list?.[0]).toContain("`upgrade`");
  });
});
