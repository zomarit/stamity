/**
 * The measurements page: what this repository can prove about its own output,
 * computed from committed artifacts rather than asserted in prose.
 *
 * The drift class this closes: a project page that says "every change is
 * gated and reviewed" is a claim about a process, and a reader has no way to
 * check it. Here the headline number is a QUOTIENT over the run records this
 * repository already commits — a run counts as verified merge-ready only when
 * its own record carries a passing final gate table, an approval verdict at or
 * above the confidence gate that record states, and a findings ledger with no
 * row left open. Everything the rule rejects is published by run id with its
 * reason, so the number cannot be raised by dropping the runs that would lower
 * it.
 *
 * **Merge-ready is a readiness, not a merge.** The merge itself is the
 * maintainer's act, and it happens after the record closes: a run record is
 * written at the end of the run, `CHANGELOG.md` names no pull-request number,
 * and the commit ids a record cites do not survive the rebase that lands them,
 * so no committed artifact links a run to its merge. Requiring one made the
 * rule unsatisfiable rather than strict. {@link mergeEvidence} still looks for
 * it and the page publishes what it finds per run — as a column a reader can
 * check, never as a clause that decides the number.
 *
 * **Self-declared wording never counts.** No record is read for the words
 * "verified", "done", or "shipped". {@link computeMergeReadyRate} looks for a
 * gate row's pass/fail verdict, a review verdict token and a ledger state —
 * three artifacts a run has to actually produce. That is the whole anti-gaming
 * constraint, and it is why the rule string is published on the page beside
 * the number.
 *
 * **Conservative in both directions it can be wrong.** A record whose final
 * gate table names a failure, whose last verdict is a request for changes, or
 * whose approval states no confidence is counted in the denominator, never the
 * numerator. A run the parser cannot read at all is EXCLUDED with the reason
 * rather than silently denominated — an unreadable record is missing evidence,
 * not evidence of failure, and burying it in the denominator would understate
 * the rate as dishonestly as dropping it would overstate it.
 *
 * **The page renders from a committed snapshot, not from the live records.**
 * {@link computeMergeReadyRate} reads `.stamity/runs/` and is what
 * `scripts/merge-ready-rate.mjs --write` freezes into
 * `evals/measurements/merge-ready-<date>.json`; {@link renderMeasurements}
 * reads the newest such file and nothing else. The seam is not ceremony: a run
 * in flight writes its record throughout the run, so a page rendered live goes
 * stale mid-run and every later run would have to regenerate a documentation
 * page in the same commit as its own record. With the snapshot, the page moves
 * when someone refreshes it, and the page says which snapshot it came from.
 *
 * **Clock-free.** `generated` is the newest closed run record's own date, and
 * the snapshot's filename date is supplied by the caller rather than read here,
 * so two renders of one tree are byte-identical and the page can be
 * byte-compared by the suite. The reach snapshot beside it is a committed fetch
 * artifact with its own `accessed` stamp; nothing here reaches the network.
 *
 * The computation lives beside the renderer rather than inside
 * `scripts/merge-ready-rate.mjs` because the page and the script must not be
 * able to disagree: the script is a thin reporting front end over this module,
 * the same way `scripts/generate-docs.mjs` is thin over the renderers.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { findPackageRoot } from "../../shared/paths.ts";
import { EngineError } from "../../types/errors.ts";
import { REGENERATE_COMMAND, frontmatterBlock } from "./referencePages.ts";

/** Repo-relative path of the committed page this module renders. */
export const MEASUREMENTS_DOC_PATH = "docs/measurements.md";

/** The command that rewrites this one page, named in its own banner. */
export const MEASUREMENTS_REGENERATE_COMMAND = `${REGENERATE_COMMAND} --page measurements`;

/** Repo-relative directory holding one directory per work run. */
export const RUNS_DIR = ".stamity/runs";

/** Repo-relative directory holding the frozen measurement snapshots. */
export const SNAPSHOT_DIR = "evals/measurements";

/** The command that refreshes the snapshot this page renders from. */
export const SNAPSHOT_REFRESH_COMMAND = "node scripts/merge-ready-rate.mjs --write";

/** Repo-relative path of the committed reach fetch artifact. */
export const REACH_SNAPSHOT_PATH = "evals/reach/npm-downloads-2026-09-14.json";

/**
 * The eval run of record, linked from the page relative to `docs/`.
 *
 * The release run of record, which since 2026-09-15 is the composed 1.8.0 run:
 * run 27 measured every case in full, and runs 29 and 30 re-measured only the
 * cases whose inputs had moved, carrying the rest with provenance under
 * SET-v7's incremental rule. The page restates run 30's own figures because a
 * composed run scores the whole set under the unchanged rule and thresholds —
 * it is the artifact that states the set's score, not a partial one.
 */
export const RUN_OF_RECORD_PATH = "evals/runs/2026-09-15-run-30/RESULTS.md";

/** The workflow whose lanes are the first-run proof. */
export const CI_WORKFLOW_PATH = ".github/workflows/ci.yml";

/**
 * The rule the rate is measured under, published beside the number.
 *
 * The maintainer's own definition, recorded 2026-09-15: merge-ready is a
 * readiness, and a merge is not part of it. The rule that preceded this one
 * carried `+ merged` as a fourth clause and no run in the corpus could satisfy
 * it — see the module docblock for why that is a property of what this
 * repository writes down rather than of what it merges.
 */
export const MERGE_READY_RULE =
  "verified merge-ready = the final gate table all pass, the last review verdict an approval at " +
  "or above the record's stated confidence gate (0.8 when unstated), and a findings ledger with " +
  "no open row; merge evidence is reported per run, never a clause; self-declared wording never " +
  "counts";

/**
 * The approval bar applied when a record states none of its own.
 *
 * 0.8 is the bar the records that DO state one state (`Confidence gate:
 * approvals count at high/>=0.8`). It is a fallback, not a default anyone
 * chose silently: a record naming its own gate is read at that gate, and the
 * page says which runs fell to this one by listing them in the denominator
 * with the reason.
 */
export const DEFAULT_CONFIDENCE_GATE = 0.8;

/**
 * What the merge-evidence column reads when no committed artifact links a run
 * to its merge — which is every non-release run in this tree today. It is a
 * stated absence rather than an empty cell: a blank column reads as an author
 * who did not look.
 */
export const MERGE_EVIDENCE_NONE = "none in committed artifacts";

/** A proof-block heading, at any heading depth. */
const PROOF_BLOCK_HEADING = /^#{2,6} .*proof block/i;

/** Any heading, with its depth captured — the proof block ends at the next one of its own depth. */
const HEADING = /^(#{1,6}) /;

/** A markdown table's separator row — what marks the line above it as a header. */
const TABLE_SEPARATOR = /^\s*\|[\s:|-]+\|\s*$/;

/** The line a record puts above its gate table, in both spellings the corpus uses. */
const GATE_RESULTS_LEAD = /gate results/i;

/** The line a record puts above its review table — `Review verdicts, …` or `Review loop (…)`. */
const REVIEW_LEAD = /review (?:verdicts|loop|rounds)/i;

/** A gate row's pass verdict. `passed` is the form a test summary uses. */
const GATE_PASS = /\bpass(?:ed|es)?\b/i;

/**
 * A gate row's failure verdict, in the forms the records use.
 *
 * `failure` and `failing` are deliberately NOT here. A gate row can name a
 * smoke lane whose whole job is to fail on purpose — `apm-install-smoke.mjs …
 * --expect-failure | pass · pass · pass` — and reading that row as a failure
 * turned a green release record into a failing one.
 */
const GATE_FAIL = /\bfail(?:ed|s)?\b/i;

/** A review verdict token. `needs-fixes` is round one's spelling of a change request. */
const VERDICT = /\b(?:approve[ds]?|request-changes|needs-fixes)\b/i;

/** The approving half of {@link VERDICT}. */
const APPROVAL = /\bapprove[ds]?\b/i;

/** The change-requesting half of {@link VERDICT}. */
const CHANGES_REQUESTED = /\b(?:request-changes|needs-fixes)\b/i;

/** A stated confidence, as a review line writes it: `0.86`, `0.9`, `1.0`. */
const CONFIDENCE = /\b([01]\.\d+)\b/g;

/** The confidence gate a record declares for its own approvals. */
const STATED_GATE = /confidence gate[^\n\d]*([01]\.\d+)/i;

/** A pull-request number, in either form a record writes it. */
const PULL_REQUEST = /#(\d+)\b/g;

/** A released version heading in the changelog. */
const RELEASE_HEADING = /^## \[(\d+\.\d+\.\d+)]/gm;

/** A release run's own version, read off its directory name. */
const RELEASE_RUN = /_release-(\d+\.\d+\.\d+)$/;

/** A run directory's date prefix. */
const RUN_DATE = /^(\d{4}-\d{2}-\d{2})_/;

/**
 * The character set a run directory name may carry.
 *
 * S-3: run ids are interpolated unescaped into a code span and table cells on
 * the rendered page (`` `${run.run}` `` and `| ${run.run} |`), the same way
 * {@link SNAPSHOT_FILE} constrains a snapshot's own filename. A directory name
 * carrying a backtick, a pipe, or a newline would break out of the Markdown it
 * is rendered into, so the walk below refuses anything outside this set before
 * it ever reaches the page.
 */
const RUN_ID_PATTERN = /^[\w.-]+$/;

/** A snapshot file, with its date captured. */
const SNAPSHOT_FILE = /^merge-ready-(\d{4}-\d{2}-\d{2})\.json$/;

/** A date a snapshot filename may carry. */
const SNAPSHOT_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A record that says the run is still going.
 *
 * A record is written THROUGHOUT its run, not at the end of it, so an open run
 * has a record with half a proof block. Reading one would put a run that has
 * not finished into the denominator and move the page's date to a day the work
 * was not done on.
 */
const IN_PROGRESS = /^status:.*\bin progress\b/im;

/** A ledger row left open — the run-exit invariant every record closes. */
const OPEN_ROW = /"state"\s*:\s*"open"/;

function fail(message: string): never {
  throw new EngineError(message, { code: "VALIDATION_ERROR" });
}

/** A run outside the measure, with the evidence it lacks. */
export interface ExcludedRun {
  /** The run directory's id, which is its name under `.stamity/runs/`. */
  readonly run: string;
  /** One line, naming the artifact the record does not carry. */
  readonly reason: string;
}

/** A qualifying run that missed a clause, with the first clause it missed. */
export interface DenominatedRun extends ExcludedRun {
  /** The merge artifact, reported beside every qualifying run. Never a clause. */
  readonly mergeEvidence: string;
}

/** A run that met every clause of the rule. */
export interface VerifiedRun {
  readonly run: string;
  /** The merge artifact, or {@link MERGE_EVIDENCE_NONE}. Reported, never scored. */
  readonly mergeEvidence: string;
}

/** The whole measurement, as the script prints it and the page states it. */
export interface MergeReadyReport {
  /** The newest run record's date. Never the wall clock — see the module docblock. */
  readonly generated: string;
  readonly rule: string;
  /** Runs that qualify for the denominator and did not reach the numerator. */
  readonly denominator: readonly DenominatedRun[];
  /** Runs that met every clause. */
  readonly numerator: readonly VerifiedRun[];
  /** Runs outside the measure entirely, each with the evidence it lacks. */
  readonly excluded: readonly ExcludedRun[];
  /** `d` counts the numerator and denominator lists together. */
  readonly rate: { readonly n: number; readonly d: number; readonly value: number };
  /** What the run read, so a stale snapshot can be told from a current one. */
  readonly computedFrom: {
    /** How many run directories carried a `record.md`. */
    readonly records: number;
    /** The newest closed record's date — the same value as {@link MergeReadyReport.generated}. */
    readonly newestRecordDate: string;
    /** The newest released version the changelog carries. */
    readonly changelogHead: string;
  };
}

/** This checkout's root, resolved the way the sibling renderers resolve theirs. */
function repoRoot(): string {
  return findPackageRoot(dirname(fileURLToPath(import.meta.url)));
}

/**
 * The proof block's own section: its heading down to the next heading at the
 * same depth or shallower.
 *
 * Depth is what makes this work over records that spell the block two ways.
 * Some carry one flat `## Proof block`; others carry `### Gate results` and
 * `### Review verdicts, per round` INSIDE it, and a cut at "the next heading of
 * any depth" would end the section at the first subheading — leaving the
 * parser with an empty block and reporting every one of those records as
 * having no gate rows.
 */
function proofBlock(record: string): string | null {
  const lines = record.split("\n");
  const start = lines.findIndex((line) => PROOF_BLOCK_HEADING.test(line));
  if (start === -1) return null;
  const depth = (HEADING.exec(lines[start] ?? "")?.[1] ?? "##").length;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => {
    const hashes = HEADING.exec(line)?.[1];
    return hashes !== undefined && hashes.length <= depth;
  });
  return (end === -1 ? rest : rest.slice(0, end)).join("\n");
}

/** One table of a proof block, with the line that introduces it. */
interface LabelledTable {
  /** The nearest non-empty line above the table — a heading or a prose lead-in. */
  readonly lead: string;
  /** Body rows only: the header and its separator are dropped. */
  readonly rows: readonly string[];
}

/**
 * Every table in the proof block, each carrying the line that introduces it.
 *
 * The lead is what makes the rest of this module honest. These records are
 * prose, and a proof block carries four tables of which only one is the gates:
 * an artifacts table lists `test/hooks/scripts.test.ts` beside "the Minor
 * pass", and a per-action attribution table has a row reading `| test-runners
 * | 6 |`. Any rule that decided "is this a gate row?" from the row's own words
 * read both of those as gate results. The records label their own sections —
 * `### Gate results (…)` or `Gate results (dedicated runner…):`, and `###
 * Review verdicts, per round` or `Review loop (…)` — so the label is what
 * selects the table, and the row contents only say what that table reports.
 */
function labelledTables(block: string): readonly LabelledTable[] {
  const tables: LabelledTable[] = [];
  let lead = "";
  let rows: string[] = [];
  let pending = "";

  const flush = (): void => {
    if (rows.length > 0) {
      const body = rows.filter((row, index) => {
        if (TABLE_SEPARATOR.test(row)) return false;
        return !TABLE_SEPARATOR.test(rows[index + 1] ?? "");
      });
      tables.push({ lead, rows: body });
    }
    rows = [];
  };

  for (const line of block.split("\n")) {
    if (line.trimStart().startsWith("|")) {
      if (rows.length === 0) lead = pending;
      rows.push(line);
      continue;
    }
    flush();
    if (line.trim() !== "") pending = line;
  }
  flush();
  return tables;
}

/**
 * The gate rows of the LAST table the record labels as its gate results.
 *
 * Last, because a proof block carries one gate table per pass — a pre-fix
 * baseline, a post-fix run, a final authoritative run — and the rule asks
 * about the one the run ended on. A row counts only when it states a pass or a
 * fail, so `| CI at the pull request head | see the pull request |` is skipped
 * rather than read as a green gate.
 */
function finalGateRows(block: string): readonly string[] {
  const gateTables = labelledTables(block).filter((table) => GATE_RESULTS_LEAD.test(table.lead));
  return (gateTables.at(-1)?.rows ?? []).filter(
    (row) => GATE_PASS.test(row) || GATE_FAIL.test(row),
  );
}

/**
 * The review verdicts of the proof block, in reading order.
 *
 * The labelled review table when the record has one; otherwise every line of
 * the block that states a verdict, which is how a record that wrote its rounds
 * as prose is still read rather than dropped.
 */
function verdictLines(block: string): readonly string[] {
  const reviewTables = labelledTables(block).filter((table) => REVIEW_LEAD.test(table.lead));
  const rows = reviewTables.at(-1)?.rows;
  const lines = rows ?? block.split("\n");
  return lines.filter((line) => VERDICT.test(line));
}

/** The confidence a verdict line states, or null when it states none. */
function statedConfidence(line: string): number | null {
  const found = [...line.matchAll(CONFIDENCE)].map((match) => Number(match[1]));
  return found.at(-1) ?? null;
}

/** The versions the changelog carries as released sections. */
function releasedVersions(changelog: string): ReadonlySet<string> {
  return new Set([...changelog.matchAll(RELEASE_HEADING)].map((match) => match[1] ?? ""));
}

/** The pull-request numbers the changelog names anywhere under a released heading. */
function releasedPullRequests(changelog: string): ReadonlySet<string> {
  const sections = changelog.split(RELEASE_HEADING);
  // `split` on a capturing regex interleaves [preamble, version, body, version, body, …];
  // the preamble is everything above the first release heading and is not a released section.
  const numbers = new Set<string>();
  for (let index = 2; index < sections.length; index += 2) {
    for (const match of (sections[index] ?? "").matchAll(PULL_REQUEST)) {
      numbers.add(match[1] ?? "");
    }
  }
  return numbers;
}

/**
 * The merge artifact for one run — reported, never scored.
 *
 * Two forms count, and both are committed: the run's own released version
 * carried by `CHANGELOG.md`, or a pull-request number the record names that the
 * changelog also names UNDER a released heading. A number that appears only
 * above the first release heading is in the unreleased section, which is where
 * a merge that has not shipped is written down.
 */
function mergeEvidence(
  run: string,
  record: string,
  versions: ReadonlySet<string>,
  pullRequests: ReadonlySet<string>,
): string {
  const released = RELEASE_RUN.exec(run)?.[1];
  if (released !== undefined && versions.has(released)) {
    return `released version ${released} in CHANGELOG`;
  }
  for (const match of record.matchAll(PULL_REQUEST)) {
    const number = match[1] ?? "";
    if (pullRequests.has(number)) return `pull request #${number} in CHANGELOG`;
  }
  return MERGE_EVIDENCE_NONE;
}

/**
 * Measure the verified merge-ready rate over this repository's run records.
 *
 * `root` is the checkout to measure, so the rule itself is testable against
 * fixture trees rather than only against this repository's own history.
 *
 * Throws `EngineError` (`VALIDATION_ERROR`) when the runs directory is absent
 * or no run qualifies: a rate over an empty denominator is the vacuous number
 * this page exists to refuse.
 */
export function computeMergeReadyRate(root: string = repoRoot()): MergeReadyReport {
  const runsDir = join(root, RUNS_DIR);
  if (!existsSync(runsDir)) {
    fail(`No ${RUNS_DIR} directory under ${root}, so there are no run records to measure.`);
  }
  const changelogPath = join(root, "CHANGELOG.md");
  if (!existsSync(changelogPath)) {
    fail(`No CHANGELOG.md under ${root}, so no merge can be proved from a committed artifact.`);
  }
  const changelog = readFileSync(changelogPath, "utf-8");
  const versions = releasedVersions(changelog);
  const pullRequests = releasedPullRequests(changelog);

  // Sorted, so the page's three lists read in run order on every filesystem
  // rather than in whatever order the directory happens to be walked in.
  const runs = readdirSync(runsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .toSorted();

  for (const run of runs) {
    if (!RUN_ID_PATTERN.test(run)) {
      fail(`Run directory name ${JSON.stringify(run)} under ${RUNS_DIR} is not [\\w.-]+; refusing to interpolate it into the rendered page.`);
    }
  }

  const numerator: VerifiedRun[] = [];
  const denominator: DenominatedRun[] = [];
  const excluded: ExcludedRun[] = [];
  const dates: string[] = [];
  let records = 0;

  for (const run of runs) {
    const recordPath = join(runsDir, run, "record.md");
    if (!existsSync(recordPath)) {
      excluded.push({ run, reason: "no record" });
      continue;
    }
    const record = readFileSync(recordPath, "utf-8");
    records += 1;
    if (IN_PROGRESS.test(record)) {
      // Before the date is taken, on purpose: an open run neither enters the
      // measure nor stamps the page with a day its work was not finished on.
      excluded.push({ run, reason: "run in progress" });
      continue;
    }
    const date = RUN_DATE.exec(run)?.[1];
    if (date !== undefined) dates.push(date);

    const block = proofBlock(record);
    if (block === null) {
      excluded.push({ run, reason: "no proof block" });
      continue;
    }
    const gateRows = finalGateRows(block);
    if (gateRows.length === 0) {
      excluded.push({ run, reason: "gates in prose only — no gate row carries a pass or fail" });
      continue;
    }
    const verdicts = verdictLines(block);
    const lastVerdict = verdicts.at(-1);
    if (lastVerdict === undefined) {
      excluded.push({ run, reason: "no review verdict" });
      continue;
    }

    // From here the run is in the denominator: it carries the evidence the rule
    // reads, and every remaining clause is a fact about that evidence. The
    // merge column is computed for all of them, so a run that missed a clause
    // still shows what its merge artifact says.
    const merge = mergeEvidence(run, record, versions, pullRequests);
    const missed = (reason: string): void => {
      denominator.push({ run, reason, mergeEvidence: merge });
    };

    const failing = gateRows.filter((row) => GATE_FAIL.test(row) || !GATE_PASS.test(row));
    if (failing.length > 0) {
      missed("the final gate table reports a failure");
      continue;
    }
    if (!APPROVAL.test(lastVerdict) || CHANGES_REQUESTED.test(lastVerdict)) {
      missed("the last review verdict is not an approval");
      continue;
    }
    const gate = Number(STATED_GATE.exec(record)?.[1] ?? DEFAULT_CONFIDENCE_GATE);
    const confidence = statedConfidence(lastVerdict);
    if (confidence === null) {
      missed("the approval states no confidence to compare to the gate");
      continue;
    }
    if (confidence < gate) {
      missed(`the approval at ${confidence} is under the ${gate} gate`);
      continue;
    }
    const ledgerPath = join(runsDir, run, "ledger.jsonl");
    if (existsSync(ledgerPath) && OPEN_ROW.test(readFileSync(ledgerPath, "utf-8"))) {
      missed("the findings ledger still carries an open row");
      continue;
    }
    numerator.push({ run, mergeEvidence: merge });
  }

  const d = numerator.length + denominator.length;
  if (d === 0) fail(`No run under ${RUNS_DIR} carries the proof block the rate is measured over.`);
  const generated = dates.toSorted().at(-1);
  if (generated === undefined) {
    fail(`No run directory under ${RUNS_DIR} carries the date prefix the page is stamped with.`);
  }

  return {
    generated,
    rule: MERGE_READY_RULE,
    denominator,
    numerator,
    excluded,
    rate: { n: numerator.length, d, value: Number((numerator.length / d).toFixed(3)) },
    computedFrom: {
      records,
      newestRecordDate: generated,
      changelogHead: [...versions].toSorted().at(-1) ?? "",
    },
  };
}

/** A frozen measurement, with the file it was read from. */
export interface MeasurementSnapshot {
  /** Repo-relative path, which the page names so a reader can open the input. */
  readonly path: string;
  readonly report: MergeReadyReport;
}

/** Every committed snapshot, newest filename date last. */
function snapshotFiles(root: string): readonly string[] {
  const dir = join(root, SNAPSHOT_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => SNAPSHOT_FILE.test(name))
    .toSorted();
}

/**
 * The newest committed measurement snapshot.
 *
 * Newest by the date IN THE FILENAME rather than by mtime: the filename is
 * committed and a checkout's timestamps are not, so two clones agree on which
 * snapshot the page renders from.
 *
 * Throws `EngineError` (`VALIDATION_ERROR`) when no snapshot exists, naming the
 * command that writes one — a page rendered from nothing is the failure this
 * whole seam exists to prevent.
 */
export function readMeasurementSnapshot(root: string = repoRoot()): MeasurementSnapshot {
  const newest = snapshotFiles(root).at(-1);
  if (newest === undefined) {
    fail(
      `No measurement snapshot under ${SNAPSHOT_DIR}. Write one with \`${SNAPSHOT_REFRESH_COMMAND}\` ` +
        `and commit it beside the page it renders.`,
    );
  }
  const path = `${SNAPSHOT_DIR}/${newest}`;
  return { path, report: JSON.parse(readFileSync(join(root, path), "utf-8")) as MergeReadyReport };
}

/**
 * Freeze today's measurement into `evals/measurements/merge-ready-<date>.json`.
 *
 * `date` is passed in rather than read from a clock here: this module renders a
 * byte-compared page and must stay clock-free, so the caller
 * (`scripts/merge-ready-rate.mjs`) is where the wall clock lives.
 *
 * Refuses to overwrite. A snapshot is the input a published number was computed
 * from; rewriting one in place erases the record of what the page said, which is
 * the same failure as editing a retained eval baseline.
 */
export function writeMeasurementSnapshot(root: string, date: string): string {
  if (!SNAPSHOT_DATE.test(date)) {
    fail(`A snapshot is dated YYYY-MM-DD; ${JSON.stringify(date)} is not.`);
  }
  const path = `${SNAPSHOT_DIR}/merge-ready-${date}.json`;
  const target = join(root, path);
  if (existsSync(target)) {
    fail(
      `${path} already exists. A snapshot is the input a published number was computed from, so ` +
        `it is never rewritten in place — delete it deliberately, or take the next one tomorrow.`,
    );
  }
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(computeMergeReadyRate(root), null, 2)}\n`, "utf-8");
  return path;
}

/** One npm downloads point response, as the registry returns it. */
export interface ReachPoint {
  readonly downloads: number;
  readonly start: string;
  readonly end: string;
}

/** The committed fetch artifact behind the reach section. */
export interface ReachSnapshot {
  readonly accessed: string;
  readonly label: string;
  readonly source: string;
  readonly lastWeek: ReachPoint;
  readonly lastMonth: ReachPoint;
  readonly daily: {
    readonly start: string;
    readonly end: string;
    readonly downloads: readonly { readonly day: string; readonly downloads: number }[];
  };
}

/** Read the committed reach snapshot. Never a fetch: the artifact IS the measurement. */
export function readReachSnapshot(root: string = repoRoot()): ReachSnapshot {
  const path = join(root, REACH_SNAPSHOT_PATH);
  if (!existsSync(path)) {
    fail(`No reach snapshot at ${REACH_SNAPSHOT_PATH}; the reach section has nothing to state.`);
  }
  return JSON.parse(readFileSync(path, "utf-8")) as ReachSnapshot;
}

/** `- ` list of run ids and their one-line reasons, or an explicit "none" line. */
function noteList(notes: readonly ExcludedRun[]): readonly string[] {
  if (notes.length === 0) return ["None."];
  return notes.map((note) => `- \`${note.run}\` — ${note.reason}`);
}

/** A two- or three-column table of runs, or an explicit "none" line. */
function runTable(
  header: readonly string[],
  rows: readonly (readonly string[])[],
): readonly string[] {
  if (rows.length === 0) return ["None."];
  return [
    `| ${header.join(" | ")} |`,
    `|${header.map(() => "---").join("|")}|`,
    ...rows.map((cells) => `| ${cells.join(" | ")} |`),
  ];
}

/**
 * Render the measurements page.
 *
 * Deterministic over one tree: every number comes from
 * {@link computeMergeReadyRate} or from the committed reach snapshot, and the
 * four corpus figures are restated from the retained run artifact with the
 * suite holding each one to that file.
 */
export function renderMeasurements(root: string = repoRoot()): string {
  const snapshot = readMeasurementSnapshot(root);
  const report = snapshot.report;
  const reach = readReachSnapshot(root);
  const daily = reach.daily.downloads;
  const total = daily.reduce((sum, row) => sum + row.downloads, 0);
  const peak = daily.reduce((best, row) => (row.downloads > best.downloads ? row : best), {
    day: reach.daily.start,
    downloads: 0,
  });

  return `${[
    frontmatterBlock("Measurements"),
    "",
    `<!-- GENERATED FILE — do not edit by hand. Rewrite it with \`${MEASUREMENTS_REGENERATE_COMMAND}\`. -->`,
    "",
    "# Measurements",
    "",
    `What this repository can prove about its own output, as of ${report.generated} — the newest`,
    "closed run record's date, which is what this page is stamped with rather than the day it was",
    "rendered. Every number below is computed from a committed artifact, so a claim here can be",
    "checked rather than believed.",
    "",
    `The merge-ready figures are rendered from [\`${snapshot.path}\`](../${snapshot.path}), the frozen`,
    `measurement committed beside this page. Refreshed per release by \`${SNAPSHOT_REFRESH_COMMAND}\``,
    "(the release checklist's record-currency line); the snapshot named above is the input, and a",
    "run record written after it is not on this page until the next refresh.",
    "",
    "## Verified merge-ready rate",
    "",
    `**${report.rate.n} of ${report.rate.d} runs** (${report.rate.value.toFixed(3)}).`,
    "",
    `The rule: ${report.rule}.`,
    "",
    "A run enters the measure when its record carries a proof block with at least one gate row",
    "stating a pass or a fail and at least one review verdict. It reaches the numerator when all",
    "three of these hold, each read off an artifact rather than off a sentence:",
    "",
    "1. every gate row of the record's final gate table reports a pass;",
    "2. the last review verdict is an approval at or above the confidence gate that record states",
    `   (${DEFAULT_CONFIDENCE_GATE} when it states none);`,
    "3. its findings ledger leaves no row `open`, which is the run-exit invariant `/st-work` declares.",
    "",
    "Merge evidence is a reported column, not a fourth clause, because merge-ready is a readiness",
    "and the merge is the maintainer's act afterwards: a record closes before its branch lands,",
    "`CHANGELOG.md` names no pull-request number, and the commit ids a record cites are not",
    "ancestors of `main` after the rebase that landed them — so no committed artifact links most",
    "runs to their merge, and scoring on one would measure the bookkeeping instead of the work.",
    "",
    "### Numerator",
    "",
    ...runTable(
      ["Run", "Merge evidence"],
      report.numerator.map((run) => [`\`${run.run}\``, run.mergeEvidence]),
    ),
    "",
    "### Denominator, less the numerator",
    "",
    "These runs carry the evidence the rule reads and did not meet every clause of it. The reason",
    "is the first clause each one missed.",
    "",
    ...runTable(
      ["Run", "First clause missed", "Merge evidence"],
      report.denominator.map((run) => [`\`${run.run}\``, run.reason, run.mergeEvidence]),
    ),
    "",
    "### Excluded, with the evidence each one lacks",
    "",
    "An unreadable record is missing evidence, not evidence of failure, so these runs are outside",
    "the measure rather than counted against it — and they are published here for the same reason",
    "the number is: an exclusion nobody can see is a number nobody can check.",
    "",
    ...noteList(report.excluded),
    "",
    "### What the number is limited by, stated rather than tuned away",
    "",
    `${report.excluded.length} run directories are outside the measure and every one of them is named`,
    "above. The denominator is small because the proof block is a convention rather than a required",
    "shape: a run that states its gates in a sentence proves the same work and cannot be read by a",
    "rule.",
    "What would move the number is the record grammar — a gate table and a verdict table every run",
    "writes — not a rewording of this page.",
    "",
    "## Reach (a proxy)",
    "",
    `Fetched ${reach.accessed} from the npm registry's public downloads API and committed at`,
    `\`${REACH_SNAPSHOT_PATH}\`, so the numbers below are a reviewable artifact rather than a`,
    "reading nobody can reproduce. Source:",
    "",
    `\`${reach.source}\``,
    "",
    "| Window | Downloads | Range |",
    "|---|---|---|",
    `| Last week | ${reach.lastWeek.downloads} | ${reach.lastWeek.start} to ${reach.lastWeek.end} |`,
    `| Last month | ${reach.lastMonth.downloads} | ${reach.lastMonth.start} to ${reach.lastMonth.end} |`,
    `| Daily range | ${total} | ${reach.daily.start} to ${reach.daily.end}, peak ${peak.downloads} on ${peak.day} |`,
    "",
    "**What this number is.** npm downloads count package fetches: CI runs, mirrors, and",
    "re-installs are all in it, and one machine installing ten times is ten downloads. It is not",
    "weekly active installations, not users, and not adoption. Real-use data is unmeasured — this",
    "project collects no telemetry — so the figure is published as a proxy, labelled as one, and",
    "never restated as anything else.",
    "",
    "## Anti-gaming constraint",
    "",
    "The rate reads three artifacts and no prose. A record that calls itself verified, complete, or",
    "shipped moves nothing: the words are never matched. What moves the number is a gate row with",
    "a pass verdict, a review verdict token at or above the record's own confidence gate, and a",
    "findings ledger with no open row.",
    "",
    "Three consequences worth stating, because they are what make the number worth reading:",
    "",
    "- **Exclusions are published, not dropped.** Every run directory the snapshot read appears",
    "  exactly once across the three lists above. Removing an inconvenient run from the",
    "  denominator would remove it from the tree, which is a reviewable diff.",
    "- **The measure is conservative where it is uncertain.** A run whose approval states no",
    "  confidence, or whose final gate table names one failure, stays in the denominator. The",
    "  number under-claims by construction.",
    "- **Merge evidence is reported, never scored.** It sits in its own column so a reader can see",
    "  what it says without it moving the rate — a clause nothing in the tree can satisfy would",
    "  have measured the bookkeeping rather than the work.",
    "",
    "## Corpus behaviour: run of record",
    "",
    "The corpus is measured by an eval set, not by inspection. The run of record is",
    `[run 30](../${RUN_OF_RECORD_PATH}) — the 1.8.0 release run,`,
    "PASS, three samples per case.",
    "",
    "That run is composed rather than measured end to end, under SET-v7's incremental rule: one",
    "full baseline run per release, and a later run on another candidate re-measures only the cases",
    "whose inputs moved and carries the rest with provenance. Run 27 measured every case in full;",
    "runs 29 and 30 re-measured only the cases the repairs touched and carried the rest, each",
    "carried case named in the composed artifact with its case-file hash and the source ranges",
    "found identical at both candidates. The figures below score the whole set:",
    "",
    "- Golden rubric pass rate **1.000** (50/50); every floor case passed, 23/23.",
    "- Adversarial guardrail hold rate **1.000** (15/15).",
    "- Benign-twin false-refusal rate **0.000** (0/4).",
    "- Trigger-probe accuracy **1.000** (30/30).",
    "",
    "Each figure is the retained artifact's own, and the suite holds these lines to that file. The",
    "run is a retained baseline: it is never re-run to produce a better number, and a set version",
    "or a model change starts a new run rather than editing this one.",
    "",
    "## First-run proof",
    "",
    "What a first run on a clean machine is proved against, in",
    `[\`${CI_WORKFLOW_PATH}\`](../${CI_WORKFLOW_PATH}):`,
    "",
    "- **Tarball smoke (publish shape)** packs the tarball, installs it into a throwaway project,",
    "  runs the leak gate over the packed tree, then `init` and `check`. It is the only lane that",
    "  reads the published shape rather than the source checkout.",
    "- **The `apm-install` job** deploys the APM package with a real client at the tested floor and",
    "  at the current release, plus a regression-witness leg that passes only when the original",
    "  routing failure is still detected.",
    "- **Dogfood check** re-proves this repository's own committed setup drift-clean with the binary",
    "  the job just built, on every leg.",
  ].join("\n")}\n`;
}
