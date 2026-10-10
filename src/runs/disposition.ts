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
 * Free text has to say something a reader can check. A trigger, a `fixed` ref,
 * a `cut` reason and a board item whose every word is a vague or a filler word
 * ({@link FILLER_WORDS}) are refused, filler words alone included (`at some
 * point`, `not yet`, `just now`). In `cut accepted risk: <reason>` the reason
 * is held to that rule alone: the marker's two words are neither vague nor
 * filler, so read with them any reason would pass. Each of the four, and a
 * handoff path, must hold at least one letter or digit, so a lone dash is no
 * trigger, no ref, no reason and no place. Words are compared as written,
 * lower-cased: a look-alike letter is not folded.
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

/**
 * Words that add no event, run or reason to a vague word beside them, so
 * `later on` and `maybe someday` say no more than `later` and `someday`, and
 * that name none on their own, so `at some point` and `not yet` say nothing.
 * Closed-class words and hedges only, each one lower-case letters: a word a
 * real trigger is made of (`touched`, `next`, `attended`, `close`, `release`)
 * never belongs here, or `when touched` and `when next attended close` would
 * stop parsing.
 */
export const FILLER_WORDS = [
  "a",
  "an",
  "the",
  "on",
  "in",
  "at",
  "for",
  "to",
  "of",
  "or",
  "and",
  "maybe",
  "perhaps",
  "probably",
  "some",
  "point",
  "time",
  "day",
  "much",
  "bit",
  "not",
  "yet",
  "until",
  "till",
  "then",
  "now",
  "just",
] as const;

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
 * The words of `text`, lower-cased: its runs of letters and digits, everything
 * else read as a gap. Punctuation, symbols, quotes and space therefore never
 * make a word, and a text of those alone has none.
 */
function wordsOf(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word !== "");
}

/** Each {@link VAGUE_TRIGGERS} entry as its words, so the two-word entry matches as a phrase. */
const VAGUE_PHRASES = VAGUE_TRIGGERS.map((entry) => ({ entry, words: entry.split(" ") }));

const FILLERS: ReadonlySet<string> = new Set(FILLER_WORDS);

/**
 * The first {@link VAGUE_TRIGGERS} entry among `words` when every word belongs
 * to a vague entry or is a {@link FILLER_WORDS} word, or `null`: when some word
 * is neither, or when no word is vague (filler alone, or no word at all).
 */
function onlyVague(words: readonly string[]): string | null {
  let found: string | null = null;
  let at = 0;
  while (at < words.length) {
    const start = at;
    const phrase = VAGUE_PHRASES.find((candidate) =>
      candidate.words.every((word, offset) => words[start + offset] === word),
    );
    if (phrase !== undefined) {
      found ??= phrase.entry;
      at += phrase.words.length;
    } else if (FILLERS.has(words[at] ?? "")) {
      at += 1;
    } else {
      return null;
    }
  }
  return found;
}

/**
 * The words of `words`, each once and in the order written, joined by a space,
 * when there is a word and every word is a {@link FILLER_WORDS} word; `null`
 * otherwise. What it returns is made of list words alone, at most the list
 * long, so a caller may name it in a problem.
 */
function onlyFiller(words: readonly string[]): string | null {
  if (words.length === 0 || !words.every((word) => FILLERS.has(word))) return null;
  return [...new Set(words)].join(" ");
}

/**
 * The {@link VAGUE_TRIGGERS} word `text` amounts to, or `null`: its every word
 * ({@link wordsOf}) is a vague or a {@link FILLER_WORDS} word and at least one
 * is vague (`later`, `Later.`, `maybe later`, a backticked `later`), or,
 * lower-cased with its spaces collapsed, it holds `hygiene batch` anywhere.
 */
function vagueWord(text: string): string | null {
  const vague = onlyVague(wordsOf(text));
  if (vague !== null) return vague;
  return text.toLowerCase().replace(/\s+/gu, " ").includes("hygiene batch") ? "hygiene batch" : null;
}

/**
 * What a trigger that names no event amounts to, or `null`. The
 * {@link VAGUE_TRIGGERS} word, when its every word is a vague or a filler word
 * and one is vague, or when it holds `hygiene batch` anywhere
 * ({@link vagueWord}); its filler words, each once and as the list spells them
 * ({@link onlyFiller}), when its every word is a {@link FILLER_WORDS} word (`at
 * some point`, `not yet`). Any other trigger is `null`, the empty and the
 * wordless one included; whether a trigger with no word is allowed is the
 * caller's to say.
 */
export function vagueTrigger(trigger: string): string | null {
  return vagueWord(trigger) ?? onlyFiller(wordsOf(trigger));
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
  if (wordsOf(rest).length === 0) return { ok: false, problem: "`when` names no trigger" };
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
  // A place with no letter and no digit (a lone dash, a lone dot) names nothing.
  if (wordsOf(target).length === 0) return refused;
  if (match[1] === "board") {
    // The trigger's rule: an item of vague and filler words, or of filler words alone, names no item.
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
  const words = wordsOf(said);
  // The only-words rule, not `vagueTrigger`'s `hygiene batch` anywhere: a ref
  // such as `in the hygiene batch of 2026-10-08` names a run a reader can find.
  const vague = onlyVague(words);
  const filler = onlyFiller(words);
  if (match[1] === "fixed") {
    if (words.length === 0) {
      return { ok: false, problem: "`fixed` names no ref: say what fixed it, as `fixed in <run id>`" };
    }
    if (vague !== null) {
      return {
        ok: false,
        problem: `\`fixed\` names only the vague word \`${vague}\`, which no reader can check: say what fixed it, as \`fixed in <run id>\``,
      };
    }
    if (filler !== null) {
      return {
        ok: false,
        problem: `\`fixed\` names only filler words (\`${filler}\`), which no reader can check: say what fixed it, as \`fixed in <run id>\``,
      };
    }
    return { ok: true, value: { kind: "fixed", ref: said } };
  }
  // `cut accepted risk: <reason>`: the marker is read by its two words, whatever
  // case or punctuation they are written with, and the reason after them is
  // held to the rule alone. The value keeps the marker, as written.
  const accepted = words[0] === "accepted" && words[1] === "risk";
  const reason = accepted ? words.slice(2) : words;
  const slot = accepted ? "`cut accepted risk:`" : "`cut`";
  const say = accepted
    ? "say why the risk is accepted, as `cut accepted risk: <reason>`"
    : "say why it was dropped, as `cut <reason>`";
  if (reason.length === 0) return { ok: false, problem: `${slot} names no reason: ${say}` };
  const vagueReason = onlyVague(reason);
  if (vagueReason !== null) {
    return {
      ok: false,
      problem: `${slot} names only the vague word \`${vagueReason}\`, which is no reason: ${say}`,
    };
  }
  const fillerReason = onlyFiller(reason);
  if (fillerReason !== null) {
    return {
      ok: false,
      problem: `${slot} names only filler words (\`${fillerReason}\`), which is no reason: ${say}`,
    };
  }
  return { ok: true, value: { kind: "cut", reason: said } };
}
