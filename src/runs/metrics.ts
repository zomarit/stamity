import { CARD_LEDGER_STATES, reportNameRole, USAGE_REVIEW_PATTERN } from "./layout.ts";
import { reopenCount, type LedgerRow } from "./ledgerStore.ts";
import { PRICES_ACCESS_DATE, PRICES_SOURCE, priceFor } from "./prices.ts";
import type { TokenSplit, TranscriptRead, TranscriptUsage } from "./transcriptUsage.ts";

/**
 * A run's first numbers, for `stamity run metrics` (REQ-FLOW-183): wall minutes, agent minutes, the person's minutes,
 * review and fix rounds, reopened findings, and tokens and cost only from a transcript the caller names. Pure: the
 * verb reads the files and hands their text in, so a read that failed arrives as a named reason, never a throw.
 *
 * **The run's clock.** Every minute here is read from stamps the run wrote itself, so it is the run's clock, never a
 * measurement (plan 024 file 3, Decisions). Wall minutes run from the record's first stamped line to its last, in
 * the order they are written; agent minutes are the sum of the `usage:` lines' `minutes=`; the person's minutes are
 * the sum of each `ask:` line's `answered=` less its `asked=`.
 *
 * **Unknown is unreported, never 0.** A record with no `ask:` line gives the person's minutes `null`, as a record
 * with no `usage:` line gives agent minutes and review rounds; a ledger that did not read gives every ledger count
 * `null`. A run with no ledger at all has no rows, so its counts are 0. Fix rounds come from the run's `reports/`
 * folder, so a folder that did not read (git-ignored, so absent in a fresh clone) gives them `null`.
 *
 * **Tokens and cost cover the transcript given, no more.** A sub-agent writes its own transcript, so the one given
 * holds none of its sub-agents' counts; every count and its cost say so, in text and in JSON.
 */

/** A full UTC stamp as a record writes one, to the minute or finer. */
const UTC = String.raw`[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}(?::[0-9]{2}(?:\.[0-9]+)?)?Z`;
/** A record line that opens with a full UTC stamp, `- <UTC> …`; a stamp of the time alone is no stamp. */
const STAMPED_LINE = new RegExp(String.raw`^\s*- +(${UTC})(?![0-9A-Za-z])`);
/** Any line the run wrote as a usage line, `- <UTC> usage: <phase | review rN> minutes=<n> …`, whatever follows the label. */
const USAGE_ANY = /^\s*- +\S+ +usage:/;
/** What a usage line's minutes follow; the first one ends the label. */
const MINUTES_KEY = " minutes=";
/** An ask line, `- <UTC> ask: <phase|qa|close> asked=<UTC> answered=<UTC|none> questions=<n>`. */
const ASK_LINE = /^\s*- +\S+ +ask: *\S+ +asked=(\S+) +answered=(\S+)/;
const ASK_ANY = /^\s*- +\S+ +ask:/;
const FULL_UTC = new RegExp(`^${UTC}$`);
/** A fixer report's name ends `-fixer-r<N>.md`; what comes before it names the unit. */
const FIXER_SUFFIX = "-fixer-r";

const UNREPORTED = "unreported";
/** What every count of tokens and its cost covers: a sub-agent's own transcript is not in the one given. */
const TRANSCRIPT_SCOPE = "the transcript given only, not sub-agents' transcripts";

interface MetricsInput {
  readonly run: string;
  /** The record's text, or null where it did not read ({@link recordFailure} says why). */
  readonly record: string | null;
  readonly recordFailure?: string;
  /** The ledger's rows, or null where it did not read ({@link ledgerFailure} says why); none for a run with no ledger. */
  readonly ledger: readonly LedgerRow[] | null;
  readonly ledgerFailure?: string;
  /** The file names in the run's `reports/` folder, or null where it did not read ({@link reportsFailure} says why). */
  readonly reports: readonly string[] | null;
  readonly reportsFailure?: string;
  /** The transcript the caller named and what reading it gave; null where none was named. */
  readonly transcript: { readonly path: string; readonly read: TranscriptRead } | null;
}

type Findings = Record<(typeof CARD_LEDGER_STATES)[number], number | null>;

interface RunMetrics {
  readonly run: string;
  readonly wall: { readonly minutes: number | null; readonly from: string | null; readonly to: string | null };
  readonly agentMinutes: { readonly value: number | null; readonly complete: boolean; readonly usageLines: number };
  readonly person: { readonly minutes: number | null; readonly asks: number; readonly source: string };
  readonly rework: {
    readonly reviewRounds: number | null;
    readonly fixRounds: number | null;
    readonly reopened: number | null;
    readonly findings: Findings;
  };
  readonly tokens: { readonly value: number | null; readonly source: string; readonly split: TokenSplit | null; readonly scope: string };
  readonly cost: { readonly usd: number | null; readonly priceSource: string; readonly accessDate: string; readonly scope: string };
  /** Each read that failed, named; its numbers read `null`. */
  readonly unread: readonly string[];
}

/**
 * A stamp's time, or null where it is no real date: `Date.parse` gives NaN for month 13 and rolls Feb 30 into March,
 * so a stamp counts only where its time prints back as the same minute.
 */
function stampTime(stamp: string): number | null {
  const time = Date.parse(stamp);
  if (!Number.isFinite(time)) return null;
  return new Date(time).toISOString().slice(0, 16) === stamp.slice(0, 16) ? time : null;
}

/** The minutes from one stamp to another, or null where either is no real date. */
function minutesBetween(from: string, to: string): number | null {
  const start = stampTime(from);
  const end = stampTime(to);
  return start === null || end === null ? null : (end - start) / 60_000;
}

/**
 * A usage line's label and its `minutes=` value as written, or null where the line has none. Split with `indexOf`, not
 * a pattern, so a line of any length reads in one pass: a lazy run between two space runs backtracks over every split
 * of a long run of spaces.
 */
function usageFields(line: string): { label: string; minutes: string } | null {
  const head = USAGE_ANY.exec(line);
  if (head === null) return null;
  const rest = line.slice(head[0].length);
  const at = rest.indexOf(MINUTES_KEY);
  if (at < 0) return null;
  const value = rest.slice(at + MINUTES_KEY.length);
  const end = value.search(/\s/);
  return { label: rest.slice(0, at).trim(), minutes: end < 0 ? value : value.slice(0, end) };
}

function wallOf(lines: readonly string[]): RunMetrics["wall"] {
  const stamps = lines.flatMap((line) => STAMPED_LINE.exec(line)?.[1] ?? []);
  const from = stamps[0];
  const to = stamps.at(-1);
  const minutes = from === undefined || to === undefined ? null : minutesBetween(from, to);
  if (from === undefined || to === undefined || minutes === null || minutes < 0) return { minutes: null, from: null, to: null };
  return { minutes: Math.round(minutes), from, to };
}

function agentOf(lines: readonly string[]): RunMetrics["agentMinutes"] {
  const usage = lines.filter((line) => USAGE_ANY.test(line));
  const minutes = usage.map((line) => usageFields(line)?.minutes ?? "").filter((value) => /^[0-9]+$/.test(value));
  if (usage.length === 0) return { value: null, complete: false, usageLines: 0 };
  return { value: minutes.reduce((sum, value) => sum + Number(value), 0), complete: minutes.length === usage.length, usageLines: usage.length };
}

function personOf(lines: readonly string[]): RunMetrics["person"] {
  const asks = lines.filter((line) => ASK_ANY.test(line));
  if (asks.length === 0) return { minutes: null, asks: 0, source: "no ask: lines in the record" };
  const spans = asks.flatMap((line) => {
    const [, asked = "", answered = ""] = ASK_LINE.exec(line) ?? [];
    if (!FULL_UTC.test(asked) || !FULL_UTC.test(answered)) return [];
    const span = minutesBetween(asked, answered);
    return span !== null && span >= 0 ? [span] : [];
  });
  const missing = asks.length - spans.length;
  const source = `ask: lines, the run's clock${missing === 0 ? "" : `; ${missing} not answered`}`;
  return { minutes: spans.length === 0 ? null : Math.round(spans.reduce((sum, span) => sum + span, 0)), asks: asks.length, source };
}

/** The highest `review r<N>` any usage line names, `review r4 and r5` naming 5; 0 where usage lines name none. */
function reviewRoundsOf(lines: readonly string[]): number | null {
  if (!lines.some((line) => USAGE_ANY.test(line))) return null;
  const rounds = lines.flatMap((line) => {
    if (!USAGE_REVIEW_PATTERN.test(line)) return [];
    const label = usageFields(line)?.label ?? "";
    return [...label.matchAll(/\br([1-9][0-9]*)\b/g)].map((match) => Number(match[1]));
  });
  return rounds.length === 0 ? 0 : Math.max(...rounds);
}

/**
 * The fix rounds the run's `reports/` folder holds: each unit's highest `<unit>-fixer-r<N>.md`, summed. A fixer writes
 * a report every round, while a ledger row names a fixer's report only where that fixer raised a finding, so the
 * folder holds the count and the ledger does not.
 */
function fixRoundsOf(reports: readonly string[] | null): number | null {
  if (reports === null) return null;
  const highest = new Map<string, number>();
  for (const name of reports) {
    if (reportNameRole(name) !== "fixer") continue;
    const at = name.lastIndexOf(FIXER_SUFFIX);
    const round = Number(name.slice(at + FIXER_SUFFIX.length, -".md".length));
    const unit = name.slice(0, at);
    highest.set(unit, Math.max(highest.get(unit) ?? 0, round));
  }
  return [...highest.values()].reduce((sum, round) => sum + round, 0);
}

function ledgerOf(ledger: readonly LedgerRow[] | null): Omit<RunMetrics["rework"], "reviewRounds" | "fixRounds"> {
  if (ledger === null) return { reopened: null, findings: { fixed: null, deferred: null, rejected: null, open: null } };
  const counted = (state: string): number => ledger.filter((row) => row.state === state).length;
  return {
    reopened: ledger.reduce((sum, row) => sum + reopenCount(row), 0),
    findings: { fixed: counted("fixed"), deferred: counted("deferred"), rejected: counted("rejected"), open: counted("open") },
  };
}

const total = (split: TokenSplit): number => split.input + split.output + split.cacheRead + split.cacheWrite5m + split.cacheWrite1h;

/** The dollars a transcript's counts cost, or why they cannot be priced. */
function costOf(usage: TranscriptUsage): { usd: number } | { reason: string } {
  if (usage.otherSpeed > 0) return { reason: `${usage.otherSpeed} message${usage.otherSpeed === 1 ? "" : "s"} at a speed the price table does not cover` };
  let usd = 0;
  for (const { model, split } of usage.models) {
    if (total(split) === 0) continue;
    const price = priceFor(model);
    if (price === null) return { reason: `${model} is not in the bundled price table` };
    usd +=
      (split.input * price.input +
        split.output * price.output +
        split.cacheRead * price.cacheRead +
        split.cacheWrite5m * price.cacheWrite5m +
        split.cacheWrite1h * price.cacheWrite1h) /
      1_000_000;
  }
  return { usd: Math.round(usd * 10_000) / 10_000 };
}

function usageOf(transcript: MetricsInput["transcript"]): Pick<RunMetrics, "tokens" | "cost"> {
  const unpriced = (reason: string): Pick<RunMetrics, "tokens" | "cost"> => ({
    tokens: { value: null, source: reason, split: null, scope: TRANSCRIPT_SCOPE },
    cost: { usd: null, priceSource: reason, accessDate: PRICES_ACCESS_DATE, scope: TRANSCRIPT_SCOPE },
  });
  if (transcript === null) return unpriced("no transcript named");
  if (!transcript.read.ok) return unpriced(transcript.read.reason);
  const { usage } = transcript.read;
  const cost = costOf(usage);
  return {
    tokens: { value: total(usage.split), source: `transcript ${transcript.path}`, split: usage.split, scope: TRANSCRIPT_SCOPE },
    cost: {
      ...("usd" in cost ? { usd: cost.usd, priceSource: PRICES_SOURCE } : { usd: null, priceSource: cost.reason }),
      accessDate: PRICES_ACCESS_DATE,
      scope: TRANSCRIPT_SCOPE,
    },
  };
}

/** The run's numbers from what the verb read. */
export function metricsFrom(input: MetricsInput): RunMetrics {
  const lines = input.record === null ? null : input.record.split(/\r?\n/);
  const transcriptFailure = input.transcript !== null && !input.transcript.read.ok ? `${input.transcript.path}: ${input.transcript.read.reason}` : undefined;
  return {
    run: input.run,
    wall: lines === null ? { minutes: null, from: null, to: null } : wallOf(lines),
    agentMinutes: lines === null ? { value: null, complete: false, usageLines: 0 } : agentOf(lines),
    person: lines === null ? { minutes: null, asks: 0, source: "the record did not read" } : personOf(lines),
    rework: { reviewRounds: lines === null ? null : reviewRoundsOf(lines), fixRounds: fixRoundsOf(input.reports), ...ledgerOf(input.ledger) },
    ...usageOf(input.transcript),
    unread: [input.recordFailure, input.ledgerFailure, input.reportsFailure, transcriptFailure].filter((reason) => reason !== undefined),
  };
}

const shown = (value: number | null): string => (value === null ? UNREPORTED : String(value));

/**
 * The numbers as lines, the last one the proof block's `metrics:` line (REQ-CTX-019) without its stamp:
 * `metrics: wall=<m> agent=<m> person=<m|unreported> rounds=<n> fixes=<n> reopened=<n|unreported> tokens=<n|unreported> cost=<usd|unreported>`.
 */
export function metricsText(metrics: RunMetrics): string[] {
  const { wall, agentMinutes, person, rework, tokens, cost } = metrics;
  // Cents, except under a dollar, where cents would print a short run's cost as 0.00.
  const usd = cost.usd === null ? UNREPORTED : cost.usd.toFixed(cost.usd < 1 ? 4 : 2);
  const split = tokens.split;
  return [
    `run: ${metrics.run}`,
    `wall: ${wall.minutes === null ? UNREPORTED : `${wall.minutes} minutes, ${wall.from ?? ""} to ${wall.to ?? ""} (the run's clock)`}`,
    `agent: ${agentMinutes.value === null ? `${UNREPORTED} (no usage: lines)` : `${agentMinutes.value} minutes from ${agentMinutes.usageLines} usage lines${agentMinutes.complete ? "" : ", or more: a line's minutes did not read"}`}`,
    `person: ${person.minutes === null ? UNREPORTED : `${person.minutes} minutes over ${person.asks} asks`} (${person.source})`,
    `rounds: review=${shown(rework.reviewRounds)} fixes=${shown(rework.fixRounds)} reopened=${shown(rework.reopened)}`,
    `findings: ${CARD_LEDGER_STATES.map((state) => `${state}=${shown(rework.findings[state])}`).join(" ")}`,
    `tokens: ${
      tokens.value === null || split === null
        ? `${UNREPORTED} (${tokens.source})`
        : `${tokens.value} (input=${split.input} output=${split.output} cache-read=${split.cacheRead} cache-write-5m=${split.cacheWrite5m} cache-write-1h=${split.cacheWrite1h}) from ${tokens.source}, ${tokens.scope}`
    }`,
    `cost: ${
      cost.usd === null
        ? `${UNREPORTED} (${cost.priceSource})`
        : `$${usd}, an estimate at list rates, not a bill, for ${cost.scope} (${cost.priceSource}, rates read ${cost.accessDate})`
    }`,
    ...metrics.unread.map((reason) => `not read: ${reason}`),
    `metrics: wall=${shown(wall.minutes)} agent=${shown(agentMinutes.value)} person=${shown(person.minutes)} rounds=${shown(rework.reviewRounds)} fixes=${shown(rework.fixRounds)} reopened=${shown(rework.reopened)} tokens=${shown(tokens.value)} cost=${usd}`,
  ];
}
