/**
 * What a named review tool said about a pull request's head (REQ-FLOW-154), as pure functions over what `run land` read
 * from GitHub: no network, no file, no process.
 *
 * Silence never passes. A head is `clean` only on the tool's own word about that head; anything unread, unknown or
 * malformed reads `waiting` until the wait runs out, then `silent`, and each of those holds the merge.
 *
 * **The state comment** is the proven signal. Only a comment whose author is a `Bot` of the configured login counts, so a
 * person pasting the same text proves nothing. The tool edits one comment in place, so that comment's `createdAt` can sit
 * long before the run it reports: the wait is timed from the request marker, never from the comment. A flag stays true
 * after every thread is resolved, so only a new run clears findings. `review-state` needs `APPROVED` on the head.
 * `reaction` needs `+1` and is the weakest: a reaction cannot be tied to a commit, so one left on an earlier head still reads.
 *
 * **Rounds** are the distinct heads carrying a request marker. Anyone who can comment can write a marker, and it can only
 * use a round up or start a wait early, which holds the merge: nothing about a marker reads clean.
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

/** What {@link reviewToolVerdict} decides on: the pull request's head, the time in milliseconds, and the three reads. */
export interface ReviewToolFacts {
  head: string;
  now: number;
  comments: { id: number; userLogin: string; userType: string; body: string; createdAt: string }[];
  reviews: { userLogin: string; commitId: string; state: string }[];
  reactions: { userLogin: string; content: string }[];
}

/** What the tool's own signal says about the head, before the wait and the rounds are weighed. */
type Reading = "clean" | "findings" | "none";

const MINUTE_MS = 60_000;

/** A commit id in full: a short id could match two commits. */
const FULL_SHA = /^[0-9a-f]{40}$/;

const REQUEST_MARKER = /<!-- stamity:review-request ([0-9a-f]{40}) -->/g;

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
 * Reads `section` of the `<!-- <marker> {...} -->` block in `body`, or `null` where there is no block, the block does not
 * parse, or the section was left null or lacks a member, so an absent flag never reads as false. A filled section beside it
 * that reports on the same commit counts too, so a security finding on the head cannot read clean through `code_review`;
 * a section left null reports on no commit and is ignored.
 */
export function parseStateBlock(
  body: string,
  marker: string,
  section: string,
): { commitSha: string; status: string; hasFindings: boolean; hasUnresolved: boolean } | null {
  const open = `<!-- ${marker} `;
  const start = body.indexOf(open);
  const end = start < 0 ? -1 : body.indexOf(" -->", start);
  const sections = end < 0 ? null : jsonRecord(body.slice(start + open.length, end));
  if (sections === null) return null;
  const read = sections[section];
  if (!isRecord(read)) return null;
  const { commit_sha: commitSha, status, has_any_findings: anyFindings, has_unresolved_findings: unresolved } = read;
  if (typeof commitSha !== "string" || !FULL_SHA.test(commitSha)) return null;
  if (typeof status !== "string" || typeof anyFindings !== "boolean" || typeof unresolved !== "boolean") return null;
  const sameCommit = Object.values(sections)
    .filter(isRecord)
    .filter((entry) => entry["commit_sha"] === commitSha);
  const unfinished = sameCommit.find((entry) => entry["status"] !== "completed");
  return {
    commitSha,
    status: unfinished === undefined ? "completed" : String(unfinished["status"]),
    hasFindings: sameCommit.some((entry) => entry["has_any_findings"] !== false),
    hasUnresolved: sameCommit.some((entry) => entry["has_unresolved_findings"] !== false),
  };
}

function stateCommentReading(facts: ReviewToolFacts, tool: ReviewToolConfig): Reading {
  const { stateMarker: marker, stateSection: section } = tool;
  if (marker === undefined || section === undefined) return "none";
  const blocks = facts.comments
    .filter((comment) => comment.userType === "Bot" && comment.userLogin === tool.login)
    .flatMap((comment) => parseStateBlock(comment.body, marker, section) ?? [])
    .filter((block) => block.commitSha === facts.head);
  const completed = blocks.filter((block) => block.status === "completed");
  if (completed.some((block) => block.hasFindings || block.hasUnresolved)) return "findings";
  return blocks.length > 0 && completed.length === blocks.length ? "clean" : "none";
}

function reviewStateReading(facts: ReviewToolFacts, tool: ReviewToolConfig): Reading {
  const states = new Set(facts.reviews.filter((review) => review.userLogin === tool.login && review.commitId === facts.head).map((review) => review.state));
  if (states.has("CHANGES_REQUESTED")) return "findings";
  return states.has("APPROVED") ? "clean" : "none";
}

function reactionReading(facts: ReviewToolFacts, tool: ReviewToolConfig): Reading {
  return facts.reactions.some((reaction) => reaction.userLogin === tool.login && reaction.content === "+1") ? "clean" : "none";
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
  const unread = unset ? "; autonomy.reviewTool needs both stateMarker and stateSection to read a state comment" : "";

  if (reading === "none" && requested !== undefined && !waitEnded) {
    return verdict("waiting", `waiting for ${login} on ${short}, up to ${waitMinutes} minutes from the request${unread}`);
  }
  if (requests.size >= rounds) return verdict("spent", `${requests.size} of ${rounds} review rounds spent with no clean head, so a person decides${unread}`);
  if (reading === "findings") return verdict("findings", `${login} reports findings on ${short}, and only a new run clears them`);
  if (waitEnded) return verdict("silent", `${login} gave no result on ${short} within ${waitMinutes} minutes${unread}`);
  return verdict("waiting", `no result from ${login} on ${short}, and no request on this head yet${unread}`);
}
