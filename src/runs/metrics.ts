import { CARD_LEDGER_STATES, USAGE_REVIEW_PATTERN } from "./layout.ts";
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
 * `null`. A run with no ledger at all has no rows, so its counts are 0.
 */

/** A full UTC stamp as a record writes one, to the minute or finer. */
const UTC = String.raw`[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}(?::[0-9]{2}(?:\.[0-9]+)?)?Z`;
/** A record line that opens with a full UTC stamp, `- <UTC> …`; a stamp of the time alone is no stamp. */
const STAMPED_LINE = new RegExp(String.raw`^\s*- +(${UTC})(?![0-9A-Za-z])`);
/** A usage line, `- <UTC> usage: <phase | review rN> minutes=<n> …`; group 1 the label, group 2 the minutes as written. */
const USAGE_LINE = /^\s*- +\S+ +usage: *(.*?) +minutes=(\S*)/;
/** Any line the run wrote as a usage line, whatever follows the label. */
const USAGE_ANY = /^\s*- +\S+ +usage:/;
/** An ask line, `- <UTC> ask: <phase|qa|close> asked=<UTC> answered=<UTC|none> questions=<n>`. */
const ASK_LINE = /^\s*- +\S+ +ask: *\S+ +asked=(\S+) +answered=(\S+)/;
const ASK_ANY = /^\s*- +\S+ +ask:/;
const FULL_UTC = new RegExp(`^${UTC}$`);
/** A fixer's report by its name, wherever a ledger row names it. */
const FIXER_REPORT = /[a-z0-9][a-z0-9-]*-fixer-r[1-9][0-9]*\.md/g;

const UNREPORTED = "unreported";

interface MetricsInput {
  readonly run: string;
  /** The record's text, or null where it did not read ({@link recordFailure} says why). */
  readonly record: string | null;
  readonly recordFailure?: string;
  /** The ledger's rows, or null where it did not read ({@link ledgerFailure} says why); none for a run with no ledger. */
  readonly ledger: readonly LedgerRow[] | null;
  readonly ledgerFailure?: string;
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
  readonly tokens: { readonly value: number | null; readonly source: string; readonly split: TokenSplit | null };
  readonly cost: { readonly usd: number | null; readonly priceSource: string; readonly accessDate: string };
  /** Each read that failed, named; its numbers read `null`. */
  readonly unread: readonly string[];
}

const minutesBetween = (from: string, to: string): number => (Date.parse(to) - Date.parse(from)) / 60_000;

function wallOf(lines: readonly string[]): RunMetrics["wall"] {
  const stamps = lines.flatMap((line) => STAMPED_LINE.exec(line)?.[1] ?? []);
  const from = stamps[0];
  const to = stamps.at(-1);
  if (from === undefined || to === undefined || minutesBetween(from, to) < 0) return { minutes: null, from: null, to: null };
  return { minutes: Math.round(minutesBetween(from, to)), from, to };
}

function agentOf(lines: readonly string[]): RunMetrics["agentMinutes"] {
  const usage = lines.filter((line) => USAGE_ANY.test(line));
  const minutes = usage.map((line) => USAGE_LINE.exec(line)?.[2] ?? "").filter((value) => /^[0-9]+$/.test(value));
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
    return span >= 0 ? [span] : [];
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
    const label = USAGE_LINE.exec(line)?.[1] ?? "";
    return [...label.matchAll(/\br([1-9][0-9]*)\b/g)].map((match) => Number(match[1]));
  });
  return rounds.length === 0 ? 0 : Math.max(...rounds);
}

/** Only `id` of a row is verified, so a field is read as text only where it is text. */
const text = (value: unknown): string => (typeof value === "string" ? value : "");

function ledgerOf(ledger: readonly LedgerRow[] | null): Omit<RunMetrics["rework"], "reviewRounds"> {
  if (ledger === null) return { fixRounds: null, reopened: null, findings: { fixed: null, deferred: null, rejected: null, open: null } };
  const fixers = new Set(ledger.flatMap((row) => [...`${text(row.report)}\n${text(row.rationale)}`.matchAll(FIXER_REPORT)].map((match) => match[0])));
  const counted = (state: string): number => ledger.filter((row) => row.state === state).length;
  return {
    fixRounds: fixers.size,
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
    tokens: { value: null, source: reason, split: null },
    cost: { usd: null, priceSource: reason, accessDate: PRICES_ACCESS_DATE },
  });
  if (transcript === null) return unpriced("no transcript named");
  if (!transcript.read.ok) return unpriced(transcript.read.reason);
  const { usage } = transcript.read;
  const cost = costOf(usage);
  return {
    tokens: { value: total(usage.split), source: `transcript ${transcript.path}`, split: usage.split },
    cost: "usd" in cost ? { usd: cost.usd, priceSource: PRICES_SOURCE, accessDate: PRICES_ACCESS_DATE } : { usd: null, priceSource: cost.reason, accessDate: PRICES_ACCESS_DATE },
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
    rework: { reviewRounds: lines === null ? null : reviewRoundsOf(lines), ...ledgerOf(input.ledger) },
    ...usageOf(input.transcript),
    unread: [input.recordFailure, input.ledgerFailure, transcriptFailure].filter((reason) => reason !== undefined),
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
        : `${tokens.value} (input=${split.input} output=${split.output} cache-read=${split.cacheRead} cache-write-5m=${split.cacheWrite5m} cache-write-1h=${split.cacheWrite1h}) from ${tokens.source}`
    }`,
    `cost: ${cost.usd === null ? `${UNREPORTED} (${cost.priceSource})` : `$${usd} (${cost.priceSource}, rates read ${cost.accessDate})`}`,
    ...metrics.unread.map((reason) => `not read: ${reason}`),
    `metrics: wall=${shown(wall.minutes)} agent=${shown(agentMinutes.value)} person=${shown(person.minutes)} rounds=${shown(rework.reviewRounds)} fixes=${shown(rework.fixRounds)} reopened=${shown(rework.reopened)} tokens=${shown(tokens.value)} cost=${usd}`,
  ];
}
