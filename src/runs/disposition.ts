/**
 * The schedule rule's grammar (REQ-FLOW-076): how a deferral leaves, and when a
 * scheduled one comes back.
 *
 * From {@link SCHEDULE_RULE_FROM} a ledger row's `retired` value states its
 * disposition as one of three shapes, a keyword optionally followed by a colon:
 *
 * - `fixed <ref>` — what fixed it (`fixed in <run id>`, `fixed by /st-quick`);
 * - `cut <reason>` — why it was dropped (`cut accepted risk: <reason>` included);
 * - `scheduled <place> · by <YYYY-MM-DD>` or `scheduled <place> · when <trigger>`
 *   (`by:` and `when:` too), split at the last ` · `, where a place is
 *   `plan docs/plans/<file>.md#<unit-id or follow-ups>`, `board <item ref>` or
 *   `handoff <path>`.
 *
 * A vague trigger ({@link VAGUE_TRIGGERS}) or an empty one, a date that names no
 * calendar day, and any other shape are refused with a one-line problem naming
 * what is missing. Values dated before the cutover are never read against it.
 *
 * Pure: text in, verdict out. A place is text and is never resolved or opened,
 * and a problem never quotes the caller's own words, only the grammar's and the
 * list's. No internal import, so it sits at kernel depth and both the ledger's
 * writer and the inbox's reader may read it. Erasable syntax only, since
 * `scripts/generate-docs.mjs` loads the CLI, and with it this module, by Node's
 * type stripping.
 */

/** The first UTC day a new `retired` value is held to the grammar, `YYYY-MM-DD`. */
export const SCHEDULE_RULE_FROM = "2026-10-10";

/** Triggers that name no event, so a row scheduled on one would never come back. */
export const VAGUE_TRIGGERS = ["later", "someday", "eventually", "tbd", "hygiene batch"] as const;

/** When a scheduled item comes back: on a day, or on an event. */
export type Due = { readonly by: string } | { readonly when: string };

/** Where a scheduled item lives until it comes back. */
export type Place =
  | { kind: "plan"; path: string; anchor: string }
  | { kind: "board"; item: string }
  | { kind: "handoff"; path: string };

/** How a deferral left. */
export type Disposition =
  | { kind: "fixed"; ref: string }
  | { kind: "cut"; reason: string }
  | { kind: "scheduled"; place: Place; due: Due };

/** The one-line form a refusal's `next` names. */
const SHAPES = "`fixed <ref>`, `cut <reason>` or `scheduled <place> · by <YYYY-MM-DD> | when <trigger>`";

/** The three place shapes, as a problem names them. */
const PLACES = "`plan docs/plans/<file>.md#<unit-id or follow-ups>`, `board <item ref>` or `handoff <path>`";

/** The days in each month of a common year. */
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

/**
 * Whether `text` is exactly `YYYY-MM-DD` naming a real day of the proleptic
 * Gregorian calendar: no surrounding space, no time, no 30th of February.
 */
export function isIsoDate(text: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(text);
  if (match === null) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = month === 2 && leap ? 29 : (MONTH_DAYS[month - 1] ?? 0);
  return day <= days;
}

/**
 * The {@link VAGUE_TRIGGERS} word `trigger` amounts to, or `null`: the trigger
 * lower-cased, its inner spaces collapsed and its leading and trailing
 * punctuation and space trimmed, equals a list word, or holds `hygiene batch`
 * anywhere. Any other trigger, the empty one included, is `null`; whether an
 * empty trigger is allowed is the caller's to say.
 */
export function vagueTrigger(trigger: string): string | null {
  const folded = trigger
    .toLowerCase()
    .replace(/\s+/gu, " ")
    .replace(/^[\p{P}\s]+|[\p{P}\s]+$/gu, "");
  for (const word of VAGUE_TRIGGERS) if (folded === word) return word;
  return folded.includes("hygiene batch") ? "hygiene batch" : null;
}

type Parsed<T> = { ok: true; value: T } | { ok: false; problem: string };

/** A keyword, an optional colon, then whitespace or the end; the rest is what follows. */
const KEYWORD = /^(fixed|cut|scheduled):?(?=\s|$)/u;

/** `by` or `when`, an optional colon, then whitespace or the end. */
const DUE_KEYWORD = /^(by|when):?(?=\s|$)/u;

/** A plan place's target: one file directly under `docs/plans/`, then `#` and the unit id or section. */
const PLAN_TARGET = /^(docs\/plans\/[A-Za-z0-9][A-Za-z0-9._-]*\.md)#([A-Za-z0-9][A-Za-z0-9._-]*)$/u;

/** The separator a scheduled value's place and due part are split at. */
const SEPARATOR = " · ";

function parseDue(text: string): Parsed<Due> {
  const match = DUE_KEYWORD.exec(text);
  if (match === null) {
    return { ok: false, problem: "the part after the last ` · ` is neither `by <YYYY-MM-DD>` nor `when <trigger>`" };
  }
  const rest = text.slice(match[0].length).trim();
  if (match[1] === "by") {
    return isIsoDate(rest)
      ? { ok: true, value: { by: rest } }
      : { ok: false, problem: "`by` names no real calendar day as YYYY-MM-DD" };
  }
  if (rest === "") return { ok: false, problem: "`when` names no trigger" };
  const vague = vagueTrigger(rest);
  if (vague !== null) {
    return {
      ok: false,
      problem: `\`when\` names the vague trigger \`${vague}\`, which no event brings back`,
    };
  }
  return { ok: true, value: { when: rest } };
}

function parsePlace(text: string): Parsed<Place> {
  const refused = { ok: false, problem: `the place is none of ${PLACES}` } as const;
  const match = /^(plan|board|handoff)\s+([\s\S]+)$/u.exec(text);
  const target = match?.[2]?.trim() ?? "";
  if (match === null || target === "") return refused;
  if (match[1] === "plan") {
    const plan = PLAN_TARGET.exec(target);
    const path = plan?.[1];
    const anchor = plan?.[2];
    return path === undefined || anchor === undefined
      ? refused
      : { ok: true, value: { kind: "plan", path, anchor } };
  }
  if (match[1] === "board") {
    return vagueTrigger(target) === null ? { ok: true, value: { kind: "board", item: target } } : refused;
  }
  return /^\S+$/u.test(target) && /[/.]/u.test(target)
    ? { ok: true, value: { kind: "handoff", path: target } }
    : refused;
}

function parseScheduled(rest: string): Parsed<Disposition> {
  if (rest.trim() === "") {
    return { ok: false, problem: "`scheduled` names no place, and no ` · by <YYYY-MM-DD>` or ` · when <trigger>`" };
  }
  const split = rest.lastIndexOf(SEPARATOR);
  if (split === -1) {
    return {
      ok: false,
      problem: "`scheduled` names no ` · by <YYYY-MM-DD>` or ` · when <trigger>` after its place",
    };
  }
  const placeText = rest.slice(0, split).trim();
  const due = parseDue(rest.slice(split + SEPARATOR.length).trim());
  const place: Parsed<Place> =
    placeText === "" ? { ok: false, problem: `\`scheduled\` names no place: write one of ${PLACES}` } : parsePlace(placeText);
  if (place.ok && due.ok) return { ok: true, value: { kind: "scheduled", place: place.value, due: due.value } };
  const problems = [place, due].flatMap((part) => (part.ok ? [] : [part.problem]));
  return { ok: false, problem: problems.join("; ") };
}

/**
 * Read one disposition — a `retired` value with its leading date already
 * stripped — against the grammar this module's header states. A refusal's
 * `problem` is one line naming what is missing; where both the place and the
 * due part of a scheduled value are wrong, it names both.
 */
export function parseDisposition(text: string): { ok: true; value: Disposition } | { ok: false; problem: string } {
  const value = text.trim();
  if (value === "") return { ok: false, problem: `the disposition is empty: write ${SHAPES}` };
  const match = KEYWORD.exec(value);
  if (match === null) {
    return {
      ok: false,
      problem: `it opens with none of \`fixed\`, \`cut\` or \`scheduled\` (a colon may follow) and a space: write ${SHAPES}`,
    };
  }
  const rest = value.slice(match[0].length);
  if (match[1] === "scheduled") return parseScheduled(rest);
  const said = rest.trim();
  if (match[1] === "fixed") {
    return said === ""
      ? { ok: false, problem: "`fixed` names no ref: say what fixed it, as `fixed in <run id>`" }
      : { ok: true, value: { kind: "fixed", ref: said } };
  }
  return said === ""
    ? { ok: false, problem: "`cut` names no reason: say why it was dropped, as `cut <reason>`" }
    : { ok: true, value: { kind: "cut", reason: said } };
}
