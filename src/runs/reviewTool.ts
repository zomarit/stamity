/**
 * What a named review tool said about a pull request's head (REQ-FLOW-154), as pure functions over what `run land` read
 * from GitHub: no network, no file, no process.
 *
 * Silence never passes. A head is `clean` only on the tool's own word about that head; anything unread, unknown or
 * malformed reads `waiting` until the wait runs out, then `silent`, and each of those holds the merge. A block the tool
 * gave that this reader cannot use holds the same way, and its reason says so rather than calling the tool silent.
 *
 * **The state comment** is read from real pull requests and proven only in tests: the full loop of request, wait, read and
 * resolve is `not run`. Only a comment whose author is a `Bot` of the configured login, and whose
 * last editor is that login or nobody, counts: a person pasting the same text proves nothing, and neither does a write
 * token rewriting the tool's own comment, which keeps the bot as author. Any comment of the tool's rewritten that way,
 * marker or not, holds the read rather than dropping out of it, or a reply could stand in for it. The tool edits one comment
 * in place, so that comment's `createdAt` can sit long before the run it reports: the wait is timed from the request marker,
 * never from the comment. A flag stays true after every thread is resolved, so only a new run clears findings. `review-state`
 * needs `APPROVED` on the head. `reaction` needs `+1` and is the weakest: a reaction cannot be tied to a commit, so one left on
 * an earlier head still reads.
 *
 * **The stated limit.** A deleted comment leaves no last editor to read, so deleting the state comment is not seen: a lone
 * reply of the tool's carrying a clean block on the head, beside an earlier `+1`, then reads clean. That needs a token that
 * can delete the tool's comment, and the tool echoing a block as raw text, which nothing has shown it does.
 *
 * **Rounds** are the distinct heads carrying a request marker. This reader counts every marker it is given, and nothing about
 * a marker reads clean; `run land` hands it only the run's own, {@link withoutRequestMarkers} clearing every other comment.
 *
 * Imports one type only, so `./landEvidence.ts` can take the verdict. Erasable syntax only, since
 * `scripts/generate-docs.mjs` loads the CLI by Node's type stripping.
 */
import type { ReviewToolConfig } from "../types/manifest.ts";

/** Where the review stands: the tool passed the head, reported on it, is still awaited, ran out the wait, or ran out of rounds. */
export type ReviewToolState = "clean" | "findings" | "waiting" | "silent" | "spent";

/** The state on one head, with the one line `run land` shows for it. */
export interface ReviewToolVerdict {
  state: ReviewToolState;
  reason: string;
  head: string;
}

/**
 * What {@link reviewToolVerdict} decides on: the pull request's head, the time in milliseconds, and the three reads.
 * A comment's `editor` is the login of its last editor in the form `userLogin` uses, a bot's with its `[bot]` ending, and
 * `null` only where the comment was read as never edited. Any other value is not trusted, so an editor that could not be
 * read is passed as a string that is no login, never as `null`.
 */
export interface ReviewToolFacts {
  head: string;
  now: number;
  comments: { id: number; userLogin: string; userType: string; editor: string | null; body: string; createdAt: string }[];
  reviews: { userLogin: string; commitId: string; state: string }[];
  reactions: { userLogin: string; content: string }[];
}

/** A state block as read: the configured section, with what the sections beside it add. */
interface StateBlock {
  commitSha: string;
  status: string;
  hasFindings: boolean;
  hasUnresolved: boolean;
}

/** A block the tool gave that this reader cannot use, with the words naming why. */
interface Unusable {
  why: string;
}

/** What the tool's own signal says about the head, before the wait and the rounds are weighed. */
type Reading = "clean" | "findings" | "none" | Unusable;

const MINUTE_MS = 60_000;

/** A commit id in full: a short id could match two commits. */
const FULL_SHA = /^[0-9a-f]{40}$/;

const REQUEST_MARKER = /<!-- stamity:review-request ([0-9a-f]{40}) -->/g;

/** What stands for an editor that was not read: no login's form, so the reader never trusts it. */
export const UNREAD_EDITOR = "unknown";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function jsonRecord(text: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(text);
    return isRecord(value) ? value : null;
  } catch {
    return null;
  }
}

/** The hidden line a review request carries, which times the wait and counts the round. */
export function requestMarker(head: string): string {
  return `<!-- stamity:review-request ${head} -->`;
}

/**
 * `body` with no request marker: what `run land` passes for a comment the run did not write, so it spends no round. Stripped
 * until nothing changes, since text around a marker can join into another once that one is gone.
 */
export function withoutRequestMarkers(body: string): string {
  const left = body.replaceAll(REQUEST_MARKER, "");
  return left === body ? body : withoutRequestMarkers(left);
}

/** Text from a comment, for a line a person reads: it can hold anything, so only plain text is shown. */
function shown(text: string): string {
  return /^[\w.:\-[\]]{1,64}$/.test(text) ? text : "an unreadable value";
}

/** The real comment leaves a section with every member null; JSON null says the same. */
function leftNull(section: unknown): boolean {
  if (!isRecord(section)) return section === null;
  const members = Object.values(section);
  return members.length > 0 && members.every((member) => member === null);
}

/** A block of the marker's own name under another version number, in a body with no block of the configured one. */
function otherVersion(body: string, marker: string): Unusable | null {
  const name = marker.replace(/\d+$/, "");
  if (name === marker) return null;
  const tail = body
    .split(`<!-- ${name}`)
    .slice(1)
    .find((text) => /^\d+ /.test(text));
  return tail === undefined ? null : { why: `its block is ${name}${tail.slice(0, tail.indexOf(" "))}, a version this reader does not know` };
}

/** The block in `body`, the reason it cannot be used, or `null` where it holds no block or the tool left the section null. */
function readBlock(body: string, marker: string, section: string): StateBlock | Unusable | null {
  if (body.split(marker).length > 2) return { why: "its comment names the marker more than once" };
  const open = `<!-- ${marker} `;
  const start = body.indexOf(open);
  if (start < 0) return otherVersion(body, marker);
  const end = body.indexOf(" -->", start);
  const sections = end < 0 ? null : jsonRecord(body.slice(start + open.length, end));
  if (sections === null) return { why: "its block does not parse" };
  const read = sections[section];
  if (leftNull(read)) return null;
  const shapeless = { why: `its ${section} section is in a shape this reader does not know` };
  if (!isRecord(read)) return shapeless;
  const { commit_sha: commitSha, status, has_any_findings: anyFindings, has_unresolved_findings: unresolved } = read;
  if (typeof commitSha !== "string" || !FULL_SHA.test(commitSha)) return shapeless;
  if (typeof status !== "string" || typeof anyFindings !== "boolean" || typeof unresolved !== "boolean") return shapeless;
  const filled = Object.entries(sections).filter(([, entry]) => !leftNull(entry));
  const elsewhere = filled.find(([, entry]) => !isRecord(entry) || entry["commit_sha"] !== commitSha);
  const sameCommit = filled.map(([, entry]) => entry).filter(isRecord).filter((entry) => entry["commit_sha"] === commitSha);
  const unfinished = sameCommit.find((entry) => entry["status"] !== "completed");
  const held = elsewhere === undefined ? null : `${shown(elsewhere[0])} not on this commit`;
  return {
    commitSha,
    status: held ?? (unfinished === undefined ? "completed" : shown(String(unfinished["status"]))),
    hasFindings: sameCommit.some((entry) => entry["has_any_findings"] !== false),
    hasUnresolved: sameCommit.some((entry) => entry["has_unresolved_findings"] !== false),
  };
}

/**
 * Reads `section` of the `<!-- <marker> {...} -->` block in `body`, or `null` where there is no block, the marker occurs more
 * than once, the block does not parse, or the section was left null or lacks a member, so an absent flag never reads as
 * false. Every other section counts too: unless left null, it must be completed on the same commit with no findings, or the
 * result is not `completed` with both flags false, so a security finding cannot read clean through `code_review`. `status`
 * then names what held it.
 */
export function parseStateBlock(body: string, marker: string, section: string): StateBlock | null {
  const read = readBlock(body, marker, section);
  return read === null || "why" in read ? null : read;
}

/** Whether the tool's own login left a `+1` on the pull request. */
function reacted(facts: ReviewToolFacts, tool: ReviewToolConfig): boolean {
  return facts.reactions.some((reaction) => reaction.userLogin === tool.login && reaction.content === "+1");
}

/**
 * The tool keeps one state comment per pull request, so two comments carrying the marker cannot both be it, and neither is
 * read, whichever commit each names. A reply echoing a block would otherwise stand in for a run that never happened. Text
 * naming the marker counts too: at worst that holds a merge for a person. Any comment of the tool's someone else last edited
 * holds the read first, marker or not, whatever the rest say: it may be the state comment with the marker taken out, so the
 * comment beside it cannot be trusted to be.
 *
 * `clean` also needs the tool's `+1` on the pull request. Text can be echoed or edited, and nobody else can react under the
 * tool's login; the tool leaves it seconds after a clean run. The limit: a reaction names no commit, so this proves the tool
 * passed the pull request once, and only the block ties that to the head.
 */
function stateCommentReading(facts: ReviewToolFacts, tool: ReviewToolConfig): Reading {
  const { stateMarker: marker, stateSection: section } = tool;
  if (marker === undefined || section === undefined) return "none";
  const fromTool = facts.comments.filter((comment) => comment.userType === "Bot" && comment.userLogin === tool.login);
  const trusted = (comment: ReviewToolFacts["comments"][number]): boolean => comment.editor === null || comment.editor === tool.login;
  const rewritten = fromTool.find((comment) => !trusted(comment));
  if (rewritten?.editor === UNREAD_EDITOR) return { why: "the last editor of its comment did not read" };
  if (rewritten !== undefined) return { why: `its comment was last edited by ${shown(String(rewritten.editor))}, not by the tool` };
  const carrying = fromTool.filter((comment) => comment.body.includes(marker));
  if (carrying.length > 1) return { why: `${carrying.length} of its comments carry the marker, and it keeps one state comment` };
  const reads = fromTool.flatMap((comment): (StateBlock | Unusable)[] => {
    const read = readBlock(comment.body, marker, section);
    return read === null ? [] : [read];
  });
  const blocks = reads.filter((read): read is StateBlock => !("why" in read)).filter((block) => block.commitSha === facts.head);
  const completed = blocks.filter((block) => block.status === "completed");
  if (completed.some((block) => block.hasFindings || block.hasUnresolved)) return "findings";
  if (blocks.length > 0 && completed.length === blocks.length) {
    return reacted(facts, tool) ? "clean" : { why: "its block reads clean and its +1 on the pull request has not come" };
  }
  const stopped = blocks.find((block) => block.status !== "completed" && block.status !== "running");
  if (stopped !== undefined) return { why: `its block reads ${stopped.status}` };
  return reads.find((read): read is Unusable => "why" in read) ?? "none";
}

function reviewStateReading(facts: ReviewToolFacts, tool: ReviewToolConfig): Reading {
  const states = new Set(facts.reviews.filter((review) => review.userLogin === tool.login && review.commitId === facts.head).map((review) => review.state));
  if (states.has("CHANGES_REQUESTED")) return "findings";
  return states.has("APPROVED") ? "clean" : "none";
}

/**
 * The limit of this mode: `+1` names no commit, so one left on an earlier head reads clean on every later head with no run,
 * and it can never read `findings`. The plan accepts that for this weakest signal. Only a hand-set manifest reaches it,
 * since `config set` offers `none` or `codex`.
 */
function reactionReading(facts: ReviewToolFacts, tool: ReviewToolConfig): Reading {
  return reacted(facts, tool) ? "clean" : "none";
}

function readingOf(facts: ReviewToolFacts, tool: ReviewToolConfig): Reading {
  if (tool.clean === "state-comment") return stateCommentReading(facts, tool);
  return tool.clean === "review-state" ? reviewStateReading(facts, tool) : reactionReading(facts, tool);
}

/** Each head a request marker names, with its first request's time: a repeated request never extends a wait. */
function requestTimes(comments: ReviewToolFacts["comments"]): Map<string, number> {
  const times = new Map<string, number>();
  for (const comment of comments) {
    for (const [, head] of comment.body.matchAll(REQUEST_MARKER)) {
      const at = Date.parse(comment.createdAt);
      const first = times.get(head as string);
      times.set(head as string, first === undefined ? at : Math.min(first, at));
    }
  }
  return times;
}

/**
 * The verdict on the head. A clean head passes whatever the rounds say. The round still open on the head is waited out
 * even when it is the last, since counting it spent would leave the tool no time to answer it. Past that, rounds used up
 * hold the merge for a person, and only then do findings or the end of the wait speak for themselves.
 */
export function reviewToolVerdict(facts: ReviewToolFacts, tool: ReviewToolConfig): ReviewToolVerdict {
  const { head, now } = facts;
  const { login, rounds, waitMinutes } = tool;
  const short = head.slice(0, 7);
  const verdict = (state: ReviewToolState, reason: string): ReviewToolVerdict => ({ state, reason, head });

  const reading = readingOf(facts, tool);
  if (reading === "clean") {
    if (tool.clean === "reaction") return verdict("clean", `${login} reacted +1, which cannot be tied to a commit`);
    return verdict("clean", `${login} reads clean on ${short}`);
  }

  const requests = requestTimes(facts.comments);
  const requested = requests.get(head);
  const waitEnded = requested !== undefined && now >= requested + waitMinutes * MINUTE_MS;
  const unset = tool.clean === "state-comment" && (tool.stateMarker === undefined || tool.stateSection === undefined);
  const unusable = typeof reading === "object" ? `; the tool answered, but ${reading.why}` : "";
  const unread = unset ? "; autonomy.reviewTool needs both stateMarker and stateSection to read a state comment" : unusable;
  const nothing = unusable === "" ? "no result" : "no usable result";

  if (reading !== "findings" && requested !== undefined && !waitEnded) {
    return verdict("waiting", `waiting for ${login} on ${short}, up to ${waitMinutes} minutes from the request${unread}`);
  }
  if (requests.size >= rounds) return verdict("spent", `${requests.size} of ${rounds} review rounds spent with no clean head, so a person decides${unread}`);
  if (reading === "findings") return verdict("findings", `${login} reports findings on ${short}, and only a new run clears them`);
  if (waitEnded) return verdict("silent", `${login} gave ${nothing} on ${short} within ${waitMinutes} minutes${unread}`);
  return verdict("waiting", `${nothing} from ${login} on ${short}, and no request on this head yet${unread}`);
}
