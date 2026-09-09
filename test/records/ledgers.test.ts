import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The records gate: every committed findings ledger and the deferral inbox they
 * feed, held to the grammar `content/commands/st-work.md` and
 * `content/commands/st-board.md` declare.
 *
 * Why this is a test and not a review habit: a ledger is written once, a run
 * record is read-only to every later run, and both live under `.stamity/`,
 * where no other suite reaches. So a row left `open` at exit, or a row closed
 * `deferred` whose deferral was never written anywhere a later run reads,
 * survives every gate this repository has — which is exactly how fourteen
 * ledgers accumulated 61 stale `open` rows and 83 deferrals with no home.
 *
 * The checks are PURE FUNCTIONS over `(ledgerText, inboxText)`, and the tree is
 * one caller among several: the fixture cases below drive the same functions
 * with hand-built text, so a green run proves the gate can fail as well as that
 * the tree passes. Ledger paths are displayed POSIX (git's own spelling) and
 * composed with `node:path` for the read, so the suite holds on Windows.
 */

/** Repo root, resolved from this file rather than from the process cwd. */
const REPO_ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));

const INBOX_PATH = ".stamity/inbox.md";

/** The seven fields a ledger row carries, per the Proof block's row schema. */
const REQUIRED_FIELDS = [
  "id",
  "phase",
  "source",
  "severity",
  "evidence",
  "state",
  "rationale",
] as const;

/**
 * The one field beyond the seven, and the shape `/st-work` declares for it: an
 * optional EIGHTH field on the same row, `retired`, whose value opens with the
 * date and then states the disposition. Not a rewritten `state`, and not a
 * second row — the ledger's converge-by-id rule forbids both, and that rule is
 * itself asserted below.
 */
const OPTIONAL_FIELDS = ["retired"] as const;

/**
 * The terminal states a committed row may end in. `closed` is a LEGACY terminal
 * spelling that predates the four-state vocabulary `/st-work` ships: it is
 * ACCEPTED here so the records that used it stay readable, and it is
 * deliberately NOT added to the grammar the corpus declares, so a new row
 * spelling `closed` is a row written against a retired vocabulary.
 *
 * Which ledgers carry it is not stated here as a count — a count is a number the
 * next author bumps. `LEGACY_CLOSED_LEDGERS` below names the carriers, and the
 * assertion that derives the carrying set from the parsed rows is the record.
 */
const TERMINAL_STATES = new Set(["fixed", "deferred", "rejected", "closed"]);

/**
 * `open` is a legal state DURING a run — the write-ahead append happens before
 * the finding is acted on — so it is known vocabulary rather than a parse
 * problem. What it may not be is the state a row is committed in, and that is
 * the dedicated assertion below. Keeping it out of the vocabulary problem list
 * means a stale `open` row fails once, in the check that names the defect,
 * instead of twice in two voices.
 */
const KNOWN_STATES = new Set([...TERMINAL_STATES, "open"]);

/**
 * The severities a row may carry. `Critical`, `Warning` and `Minor` are the
 * three `/st-work`'s row schema declares; `Info` is a LEGACY fourth, given the
 * same treatment as `closed` above — ACCEPTED so the records that used it stay
 * readable, and deliberately NOT added to the grammar the corpus declares, so a
 * new row spelling `Info` is a row written against a retired vocabulary. Both
 * records are held to this set: a ledger whose `severity` went unchecked let any
 * string through the field the inbox row is built from.
 *
 * Which ledgers carry it is named in `LEGACY_INFO_LEDGERS` below, and derived
 * from the parsed rows by the assertion beneath it. An earlier revision of this
 * comment counted the carriers by hand and got both the list and the totals
 * wrong, which is the argument for deriving them.
 */
const SEVERITIES = new Set(["Critical", "Warning", "Minor", "Info"]);

/**
 * The ledgers carrying each legacy spelling, by NAME rather than by count. A
 * count moves whenever a carrier is edited and teaches the next author to bump
 * the number; a name list moves only when a ledger starts or stops carrying the
 * spelling, which is the event worth failing on.
 */
const LEGACY_CLOSED_LEDGERS = [
  ".stamity/runs/2026-09-01_closure-run/ledger.jsonl",
  ".stamity/runs/2026-09-01_frontier-review-pr10/ledger.jsonl",
  ".stamity/runs/2026-09-02_package-6/ledger.jsonl",
] as const;

const LEGACY_INFO_LEDGERS = [
  ".stamity/runs/2026-09-01_closure-run/ledger.jsonl",
  ".stamity/runs/2026-09-01_frontier-review-pr10/ledger.jsonl",
  ".stamity/runs/2026-09-02_package-6/ledger.jsonl",
  ".stamity/runs/2026-09-04_package-8-closeout/ledger.jsonl",
  ".stamity/runs/2026-09-04_package-8/ledger.jsonl",
  ".stamity/runs/2026-09-07_package-4/ledger.jsonl",
] as const;

/**
 * The `retired` value's declared shape: it opens with a `YYYY-MM-DD` date and
 * then states the disposition. Both halves are required — the date is the audit
 * trail a reader places against a commit, and a bare date states nothing about
 * what happened to the deferral, so neither alone retires a row.
 */
const RETIRED_DATE = /^\d{4}-\d{2}-\d{2}\s+\S/;

/**
 * A `Ref:` value, in the two forms `/st-board`'s grammar declares: a bare
 * `<path>`, or `<path>#<anchor>` naming one line inside it. `/st-work`'s close
 * writes the anchored form (`<the run's ledger path>#<row id>`), while a
 * `/st-rework` or `/st-pr-resolve` row may name a record whose whole file is
 * the reference. The one place the anchor is mandatory is a ledger: it is
 * addressable only by row id, so a bare `ledger.jsonl` path names nothing the
 * dangling check below can resolve.
 */
const REF_PATH = /^[^\s#]+$/;
const REF_ANCHORED = /^[^\s#]+#\S+$/;
const LEDGER_SUFFIX = "ledger.jsonl";

/** The grammar problem with a `Ref:` value, or null where it parses. */
const refProblem = (ref: string): string | null => {
  if (REF_PATH.test(ref)) {
    return ref.endsWith(LEDGER_SUFFIX)
      ? `\`Ref: ${ref}\` names a ledger, which is addressable only as \`<path>#<row id>\``
      : null;
  }
  if (REF_ANCHORED.test(ref)) return null;
  return `\`Ref: ${ref}\` is neither \`<path>\` nor \`<path>#<anchor>\``;
};

interface LedgerRow {
  readonly id: string;
  readonly severity: string;
  readonly state: string;
  readonly rationale: string;
  /** The retirement line, or null where the row carries none. */
  readonly retired: string | null;
}

interface LedgerParse {
  readonly rows: readonly LedgerRow[];
  /** One line per violation, each naming the ledger and the physical line. */
  readonly problems: readonly string[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Parse one ledger's text. Blank lines are skipped; every other line must be a
 * JSON object carrying exactly the seven required fields, optionally `retired`.
 * Rows that fail to parse are reported and dropped, so a later check never
 * reasons about a row whose shape it could not read.
 */
const parseLedger = (ledgerPath: string, text: string): LedgerParse => {
  const rows: LedgerRow[] = [];
  const problems: string[] = [];
  const allowed = new Set<string>([...REQUIRED_FIELDS, ...OPTIONAL_FIELDS]);

  text.split("\n").forEach((line, index) => {
    const at = `${ledgerPath}:${index + 1}`;
    if (line.trim() === "") return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (error) {
      problems.push(`${at}: not JSON — ${(error as Error).message}`);
      return;
    }
    if (!isRecord(parsed)) {
      problems.push(`${at}: a row is a JSON object, not ${Array.isArray(parsed) ? "an array" : typeof parsed}`);
      return;
    }

    const missing = REQUIRED_FIELDS.filter((field) => typeof parsed[field] !== "string");
    if (missing.length > 0) {
      problems.push(`${at}: missing or non-string field(s) ${missing.join(", ")}`);
      return;
    }
    const unknown = Object.keys(parsed).filter((key) => !allowed.has(key));
    if (unknown.length > 0) {
      problems.push(`${at}: field(s) outside the row schema — ${unknown.join(", ")}`);
      return;
    }
    if (parsed["retired"] !== undefined && typeof parsed["retired"] !== "string") {
      problems.push(`${at}: \`retired\` is a string when present`);
      return;
    }

    const id = String(parsed["id"]);
    const severity = String(parsed["severity"]);
    const state = String(parsed["state"]);
    if (!SEVERITIES.has(severity)) {
      problems.push(`${at}: severity \`${severity}\` is outside ${[...SEVERITIES].join(", ")}`);
      return;
    }
    const rationale = String(parsed["rationale"]);
    if (!KNOWN_STATES.has(state)) {
      problems.push(`${at}: state \`${state}\` is outside the declared vocabulary`);
      return;
    }
    if (state === "deferred" && rationale.trim() === "") {
      problems.push(`${ledgerPath}#${id}: a deferred row carries a rationale`);
    }
    const retiredValue = parsed["retired"];
    rows.push({
      id,
      severity,
      state,
      rationale,
      retired: typeof retiredValue === "string" ? retiredValue : null,
    });
  });

  return { rows, problems };
};

/**
 * `<ledger>#<id>` for every id a ledger carries more than once. The id is what
 * makes the in-place rewrite converge instead of appending a second row, so two
 * rows sharing one id are two answers to the same finding: an inbox `Ref:`
 * resolves to whichever the reader reaches first, and a retirement lands on one
 * of them. Reported once per repeated id, not once per extra row.
 */
const duplicateIds = (ledgerPath: string, rows: readonly LedgerRow[]): string[] => {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const { id } of rows) {
    if (seen.has(id)) repeated.add(id);
    seen.add(id);
  }
  return [...repeated].map((id) => `${ledgerPath}#${id}`);
};

/** `<ledger>#<id>` for every row a committed ledger left `open`. */
const openRowLabels = (ledgerPath: string, rows: readonly LedgerRow[]): string[] =>
  rows.filter((row) => row.state === "open").map((row) => `${ledgerPath}#${row.id}`);

interface InboxBullet {
  readonly severity: string;
  readonly location: string;
  readonly description: string;
  readonly source: string;
  readonly ref: string | null;
  readonly tag: string | null;
}

interface InboxParse {
  readonly rows: readonly InboxBullet[];
  readonly problems: readonly string[];
}

/**
 * Parse the inbox under `/st-board`'s declared row grammar:
 * `severity · file:line · description · source: <writer>`, with an optional
 * `Ref: <path>` or `Ref: <path>#<anchor>` and an optional trailing tag word. Non-bullet lines —
 * headings, prose, blanks — are not rows and are ignored: the grammar governs
 * what a reader can parse, not what a writer is allowed to say around it.
 */
const parseInbox = (text: string): InboxParse => {
  const rows: InboxBullet[] = [];
  const problems: string[] = [];

  text.split("\n").forEach((line, index) => {
    const at = `${INBOX_PATH}:${index + 1}`;
    if (!line.startsWith("- ")) return;
    const fields = line.slice(2).split(" · ");

    const sourceIndex = fields.findIndex((field) => field.startsWith("source: "));
    if (sourceIndex === -1) {
      problems.push(`${at}: no \`source: <writer>\` field`);
      return;
    }
    if (sourceIndex < 3) {
      problems.push(`${at}: \`source:\` arrives before severity, location and description are all present`);
      return;
    }
    const severity = fields[0] ?? "";
    if (!SEVERITIES.has(severity)) {
      problems.push(`${at}: severity \`${severity}\` is outside ${[...SEVERITIES].join(", ")}`);
      return;
    }
    const location = fields[1] ?? "";
    if (location.trim() === "") {
      problems.push(`${at}: the location field is a \`file:line\` or \`—\`, never empty`);
      return;
    }
    const description = fields.slice(2, sourceIndex).join(" · ");
    if (description.trim() === "") {
      problems.push(`${at}: the description field is empty`);
      return;
    }
    const writer = (fields[sourceIndex] ?? "").slice("source: ".length).trim();
    if (writer === "") {
      problems.push(`${at}: \`source:\` names no writer`);
      return;
    }

    const rest = fields.slice(sourceIndex + 1);
    let ref: string | null = null;
    if (rest[0]?.startsWith("Ref: ") === true) {
      ref = rest[0].slice("Ref: ".length).trim();
      const problem = refProblem(ref);
      if (problem !== null) {
        problems.push(`${at}: ${problem}`);
        return;
      }
      rest.shift();
    }
    const tag = rest.length > 0 ? (rest[0] ?? "") : null;
    if (rest.length > 1 || (tag !== null && (tag.trim() === "" || /\s/.test(tag.trim())))) {
      problems.push(`${at}: trailing field(s) beyond one optional tag word — ${rest.join(" · ")}`);
      return;
    }

    rows.push({ severity, location, description, source: writer, ref, tag: tag?.trim() ?? null });
  });

  return { rows, problems };
};

/** Every `Ref:` value the inbox carries, as written. */
const inboxRefs = (text: string): Set<string> =>
  new Set(parseInbox(text).rows.flatMap((row) => (row.ref === null ? [] : [row.ref])));

/**
 * `<ledger>#<id>` for every `deferred` row that is accounted for by neither a
 * dated `retired` line nor an inbox row pointing back at it. That pair is the
 * whole contract: a deferral either left (retired, with the date it left on) or
 * it is live somewhere a later run reads.
 */
const unaccountedDeferrals = (
  ledgerPath: string,
  rows: readonly LedgerRow[],
  refs: ReadonlySet<string>,
): string[] =>
  rows
    .filter((row) => row.state === "deferred")
    .filter((row) => !(row.retired !== null && RETIRED_DATE.test(row.retired.trim())))
    .filter((row) => !refs.has(`${ledgerPath}#${row.id}`))
    .map((row) => `${ledgerPath}#${row.id}`);

/** Every `ledger.jsonl` git tracks under `.stamity/runs/`, POSIX-spelled. */
const trackedLedgers = (): string[] =>
  execFileSync("git", ["ls-files", "--", ".stamity/runs"], { cwd: REPO_ROOT, encoding: "utf8" })
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.endsWith("/ledger.jsonl"))
    .toSorted();

const readRepoFile = (relPath: string): string =>
  readFileSync(join(REPO_ROOT, ...relPath.split("/")), "utf8");

const LEDGERS = trackedLedgers();
const INBOX_TEXT = existsSync(join(REPO_ROOT, ...INBOX_PATH.split("/")))
  ? readRepoFile(INBOX_PATH)
  : "";
const REFS = inboxRefs(INBOX_TEXT);
const PARSED = new Map(LEDGERS.map((path) => [path, parseLedger(path, readRepoFile(path))]));

describe("committed run ledgers", () => {
  it("finds the ledgers to check", () => {
    // The gate is vacuous the moment the enumeration stops matching, and a
    // vacuous gate over records nobody else reads is indistinguishable from a
    // clean tree. Any tracked run directory means at least one ledger.
    expect(LEDGERS.length, "no tracked ledger.jsonl under .stamity/runs/").toBeGreaterThan(0);
    expect(LEDGERS.every((path) => path.startsWith(".stamity/runs/"))).toBe(true);
  });

  it("carries only rows that parse under the seven-field schema", () => {
    const problems = LEDGERS.flatMap((path) => [...(PARSED.get(path)?.problems ?? [])]);
    expect(problems, `${problems.length} ledger row(s) outside the schema`).toEqual([]);
  });

  it("carries each row id once per ledger, so the rewrite converges", () => {
    // `/st-work` appends a row `open` and rewrites it in place as its state
    // moves, and the id is the whole of what makes that converge. A second row
    // under the same id makes the ledger ambiguous to every later reader — the
    // inbox `Ref:` below resolves to one of them, the retirement lands on one of
    // them, and nothing says which.
    const duplicates = LEDGERS.flatMap((path) => duplicateIds(path, PARSED.get(path)?.rows ?? []));
    expect(duplicates, `${duplicates.length} row id(s) appearing twice in one ledger`).toEqual([]);
  });

  it("confines the legacy vocabulary to the ledgers that already carry it", () => {
    // `closed` and `Info` are accepted so old records stay readable, which is
    // exactly the accommodation that spreads if nothing watches it. The carrying
    // sets are DERIVED from the parsed rows and pinned by ledger name: a new run
    // reaching for either spelling fails here, and a hand-maintained count — the
    // shape this comment carried before, and got wrong — cannot drift silently
    // because there is no count to maintain.
    const carriers = (holds: (row: LedgerRow) => boolean): string[] =>
      LEDGERS.filter((path) => (PARSED.get(path)?.rows ?? []).some(holds));

    expect(
      carriers((row) => row.state === "closed"),
      "the ledgers carrying the legacy `closed` state have changed",
    ).toEqual([...LEGACY_CLOSED_LEDGERS]);
    expect(
      carriers((row) => row.severity === "Info"),
      "the ledgers carrying the legacy `Info` severity have changed",
    ).toEqual([...LEGACY_INFO_LEDGERS]);
  });

  it("leaves no row `open` in a committed ledger", () => {
    // The run-exit invariant, enforced where it is checkable: a committed
    // ledger is read by later runs, so a row still `open` when the record was
    // written is a gate failure and not a note.
    const open = LEDGERS.flatMap((path) => openRowLabels(path, PARSED.get(path)?.rows ?? []));
    expect(open, `${open.length} row(s) committed in state \`open\``).toEqual([]);
  });

  it("accounts for every deferred row, by a dated retirement or an inbox row", () => {
    const unaccounted = LEDGERS.flatMap((path) =>
      unaccountedDeferrals(path, PARSED.get(path)?.rows ?? [], REFS),
    );
    expect(
      unaccounted,
      `${unaccounted.length} deferred row(s) with neither a dated \`retired\` line nor an inbox row`,
    ).toEqual([]);
  });
});

describe("the deferral inbox", () => {
  it("exists at the one declared path", () => {
    expect(
      existsSync(join(REPO_ROOT, ...INBOX_PATH.split("/"))),
      `${INBOX_PATH} is the deferral home five writers name; it has to exist`,
    ).toBe(true);
  });

  it("parses every bullet under the board's declared row grammar", () => {
    const { rows, problems } = parseInbox(INBOX_TEXT);
    expect(problems, `${problems.length} inbox row(s) outside the grammar`).toEqual([]);
    // No floor on the row count: an empty inbox is the state a completeness pass leaves
    // behind, and the parser's own non-vacuity is proven by the fixtures below, not by
    // the tree happening to carry a deferral today.
    expect(rows.length, "the inbox holds a negative number of rows").toBeGreaterThanOrEqual(0);
  });

  it("points every ledger `Ref:` at a row that exists", () => {
    const dangling: string[] = [];
    for (const ref of REFS) {
      const hash = ref.indexOf("#");
      // A bare `<path>` names a whole file, so there is no row for it to dangle
      // against; the grammar admits it and this check has nothing to say.
      if (hash === -1) continue;
      const path = ref.slice(0, hash);
      const anchor = ref.slice(hash + 1);
      if (!path.endsWith(LEDGER_SUFFIX)) continue;
      const parsed = PARSED.get(path);
      if (parsed === undefined) {
        dangling.push(`${ref} — no tracked ledger at that path`);
        continue;
      }
      if (!parsed.rows.some((row) => row.id === anchor)) dangling.push(`${ref} — no row with that id`);
    }
    expect(dangling, `${dangling.length} inbox Ref(s) naming no ledger row`).toEqual([]);
  });
});

/** One hand-built ledger row, the seven fields with the fixture's overrides. */
const row = (fields: Record<string, string>): string =>
  JSON.stringify({
    id: "r1/build/1",
    phase: "build",
    source: "implementer",
    severity: "Minor",
    evidence: "src/a.ts:1",
    state: "fixed",
    rationale: "",
    ...fields,
  });

/** The fixtures' ledger path: a run directory that does not exist, on purpose. */
const LEDGER = ".stamity/runs/fixture/ledger.jsonl";

describe("fixtures — the gate fails where it must", () => {
  it("(a) fails on a row committed `open`", () => {
    const text = row({ id: "r1/prove/2", state: "open", rationale: "" });
    const { rows, problems } = parseLedger(LEDGER, text);
    // `open` is known vocabulary — the write-ahead append uses it — so the
    // schema check passes it and the dedicated assertion is the one that fires.
    expect(problems).toEqual([]);
    expect(openRowLabels(LEDGER, rows)).toEqual([`${LEDGER}#r1/prove/2`]);
  });

  it("(b) fails on a deferred row with neither a retirement nor an inbox row", () => {
    const text = row({ id: "r1/prove/3", state: "deferred", rationale: "out of this unit's scope" });
    const { rows } = parseLedger(LEDGER, text);
    expect(unaccountedDeferrals(LEDGER, rows, inboxRefs("# Inbox\n\nno rows here.\n"))).toEqual([
      `${LEDGER}#r1/prove/3`,
    ]);
  });

  it("(c) passes a deferred row carrying a dated retirement", () => {
    const text = row({
      id: "r1/prove/4",
      state: "deferred",
      rationale: "belongs to the next unit",
      retired: "2026-09-09 scheduled to L2, trigger: the next client release, owner: the maintainer",
    });
    const { rows, problems } = parseLedger(LEDGER, text);
    expect(problems).toEqual([]);
    expect(unaccountedDeferrals(LEDGER, rows, new Set())).toEqual([]);
  });

  it("(d) passes a deferred row named by an inbox Ref", () => {
    const text = row({ id: "r1/prove/5", state: "deferred", rationale: "tracked in the inbox" });
    const inbox = [
      "# Deferral inbox",
      "",
      "## fixture",
      "",
      `- Minor · src/a.ts:1 · the consequence in one line · source: /st-work · Ref: ${LEDGER}#r1/prove/5`,
      "",
    ].join("\n");
    const { rows } = parseLedger(LEDGER, text);
    expect(parseInbox(inbox).problems).toEqual([]);
    expect(unaccountedDeferrals(LEDGER, rows, inboxRefs(inbox))).toEqual([]);
  });

  it("(e) an undated retirement does not account for a deferral", () => {
    // The date is the audit trail: "retired" with no day is a claim nobody can
    // place against a commit, so it reads as no retirement at all.
    const text = row({ id: "r1/prove/6", state: "deferred", rationale: "r", retired: "scheduled" });
    const { rows } = parseLedger(LEDGER, text);
    expect(unaccountedDeferrals(LEDGER, rows, new Set())).toEqual([`${LEDGER}#r1/prove/6`]);
  });

  it("(f) a date with no disposition does not account for a deferral either", () => {
    // The declared shape is a date THEN the disposition. A bare date says a row
    // was touched on a day and nothing about what happened to the deferral, so
    // it retires nothing — the same verdict as the undated line above, reached
    // from the other missing half.
    const text = row({ id: "r1/prove/7", state: "deferred", rationale: "r", retired: "2026-09-09" });
    const { rows } = parseLedger(LEDGER, text);
    expect(unaccountedDeferrals(LEDGER, rows, new Set())).toEqual([`${LEDGER}#r1/prove/7`]);
  });

  it("(g) fails on two rows sharing one id", () => {
    // The converge-by-id rule, driven from the failing side: the same finding
    // written twice is what the in-place rewrite exists to prevent, and one id
    // repeated is reported once however many rows carry it.
    const text = [
      row({ id: "r1/build/1", state: "fixed" }),
      row({ id: "r1/build/1", state: "deferred", rationale: "the second answer" }),
      row({ id: "r1/build/1", state: "rejected", rationale: "and a third" }),
      row({ id: "r1/build/2", state: "fixed" }),
    ].join("\n");
    const { rows, problems } = parseLedger(LEDGER, text);
    expect(problems).toEqual([]);
    expect(duplicateIds(LEDGER, rows)).toEqual([`${LEDGER}#r1/build/1`]);
    // And the clean case stays clean, so the check is not asserting on arity.
    expect(duplicateIds(LEDGER, parseLedger(LEDGER, row({})).rows)).toEqual([]);
  });

  it("reports rows outside the schema — bad JSON, a stray field, a state, a severity, a missing rationale", () => {
    expect(parseLedger(LEDGER, "{not json}").problems[0]).toContain("not JSON");
    expect(parseLedger(LEDGER, "[]").problems[0]).toContain("a JSON object");
    expect(parseLedger(LEDGER, row({ owner: "someone" })).problems[0]).toContain(
      "outside the row schema — owner",
    );
    expect(parseLedger(LEDGER, '{"id":"x"}').problems[0]).toContain("missing or non-string field(s)");
    expect(parseLedger(LEDGER, row({ state: "wontfix" })).problems[0]).toContain(
      "outside the declared vocabulary",
    );
    expect(parseLedger(LEDGER, row({ severity: "Trivial" })).problems[0]).toContain(
      "severity `Trivial` is outside",
    );
    // The legacy fourth is admitted on the ledger exactly as it is on the inbox.
    expect(parseLedger(LEDGER, row({ severity: "Info" })).problems).toEqual([]);
    expect(parseLedger(LEDGER, row({ state: "deferred", rationale: "  " })).problems[0]).toContain(
      "a deferred row carries a rationale",
    );
    expect(parseLedger(LEDGER, row({ retired: "" })).rows[0]?.retired).toBe("");
    // Blank lines are skipped rather than reported.
    expect(parseLedger(LEDGER, `\n${row({})}\n\n`).problems).toEqual([]);
  });

  it("reports inbox bullets outside the grammar, and ignores everything that is not one", () => {
    const problem = (line: string): string => parseInbox(line).problems[0] ?? "";
    expect(problem("- Trivial · — · d · source: /st-work")).toContain("severity `Trivial`");
    expect(problem("- Minor · — · d")).toContain("no `source: <writer>` field");
    expect(problem("- Minor · source: /st-work")).toContain("arrives before severity");
    expect(problem("- Minor ·  · d · source: /st-work")).toContain("never empty");
    expect(problem("- Minor · — ·   · source: /st-work")).toContain("description field is empty");
    expect(problem("- Minor · — · d · source: ")).toContain("`source:` names no writer");
    expect(problem("- Minor · — · d · source: /st-work · Ref: ")).toContain(
      "is neither `<path>` nor `<path>#<anchor>`",
    );
    expect(problem("- Minor · — · d · source: /st-work · Ref: r.jsonl#")).toContain(
      "is neither `<path>` nor `<path>#<anchor>`",
    );
    // A ledger is addressable only by row id, so the bare path is the one path
    // shape the grammar's optional anchor is not optional for.
    expect(problem(`- Minor · — · d · source: /st-work · Ref: ${LEDGER}`)).toContain(
      "addressable only as `<path>#<row id>`",
    );
    expect(problem("- Minor · — · d · source: /st-work · two words")).toContain("beyond one optional tag");
    expect(problem("- Minor · — · d · source: /st-work · a#1 · b")).toContain("trailing field(s)");
    // Prose, headings and blank lines are not rows.
    expect(parseInbox("# Deferral inbox\n\nRows: 3.\n  - indented\n").problems).toEqual([]);
    // The full shape, with the tag, parses.
    const tagged = "- Critical · src/a.ts:9 · the consequence · source: rework main · Ref: r.jsonl#a/1 · critical-deferred";
    const parsed = parseInbox(tagged);
    expect(parsed.problems).toEqual([]);
    expect(parsed.rows[0]?.tag).toBe("critical-deferred");
    expect(parsed.rows[0]?.ref).toBe("r.jsonl#a/1");
    // And the grammar's other declared form — a bare path, which is what a row
    // naming a whole record carries — parses as the same optional field.
    const bare = parseInbox("- Minor · — · d · source: rework main · Ref: .stamity/runs/x/record.md");
    expect(bare.problems).toEqual([]);
    expect(bare.rows[0]?.ref).toBe(".stamity/runs/x/record.md");
  });
});
