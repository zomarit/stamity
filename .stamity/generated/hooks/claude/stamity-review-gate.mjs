#!/usr/bin/env node
// stamity — work-scoped review gate.
//
// Holds a run's completion while its review loop has an open round, up to
// round 4. At the cap the gate opens: the run's ladder ends it as
// BLOCKED_FAILURE with the open findings attached, and a hook that kept
// blocking past its own cap would be the unbounded gate this design avoids.
//
// Round count and last verdict, keyed by run, live in one JSON file under
// the state directory — the only thing this script writes. Read, modify and
// write happen while this process holds an exclusive lock file beside it, so
// two sub-agents finishing at once serialize instead of losing a round; the
// write itself is temp+rename, which buys a reader whole bytes and is NOT a
// substitute for the lock. A round this script cannot count is a round the
// gate does not hold, so an undercount opens a loop that had not converged.
//
// The verdict comes off the reviewer's own final text, which is what the
// client sends with a sub-agent stop: a structured payload field wins where
// one exists, and otherwise the labelled verdict and confidence are read out
// of that text and narrowed to the reviewer contract's vocabulary. Text that
// names none, or names two different ones, reads as unrecorded and the round
// stays open — a missed release costs one round, a wrong one costs a review.
// That coupling is load-bearing: this gate releases an approved run only when
// the reviewer's final text carries a labelled `verdict:` line, and a review
// that returns its verdict some other way is held to the cap and ends as
// BLOCKED_FAILURE with nothing open. Read the reviewer's return contract
// beside this file before changing either side.
//
// Fail-open: a counter file that is missing, oversized, unreadable or
// unparseable opens the gate and says so on stderr. A gate that cannot read
// its own state must not wedge a run. A run with no recorded round is not
// this gate's to hold either — it exits 0 untouched.
//
// Blocking client: a refusal exits 2 and the completion stops.
//
// Generated file — regenerate it rather than editing; local edits are overwritten.
// Trust posture: exec form, repo-committed, no dynamic evaluation, no network reach.
// Reads outside repo state: the payload on stdin, the wall clock, and the
// round counter this script owns. Every outcome — held, opened, or recorded —
// goes to stderr on exit 0 unless the completion is actually blocked; whether
// an operator SEES that line is the client's choice, so treat it as a record
// the client may keep, never as a notification this script can promise.

import { randomBytes } from "node:crypto";
import { closeSync, constants as FS, mkdirSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";

const STATE_SEGMENTS = [".stamity","review-gate.json"];
const MAX_STATE_BYTES = 131072;
const MAX_ROUNDS = 4;
const MAX_RUN_AGE_MS = 604800000;
const MAX_RUNS = 200;
const MAX_ID_CHARS = 128;
const MAX_WORD_CHARS = 32;
const SCHEMA = "stamity/review-gate/v1";
const REVIEWER_AGENT = "stamity-reviewer";
const GOVERNED_PREFIX = "stamity-";
const COMPLETION_EVENTS = ["TaskCompleted"];
const MESSAGE_FIELDS = ["last_assistant_message","lastAssistantMessage"];
const MAX_MESSAGE_CHARS = 65536;
const VERDICTS = ["approve","request-changes","blocked"];
const CONFIDENCES = ["high","medium","low"];
const VERDICT_LABEL = new RegExp("verdict[^A-Za-z0-9]{0,4}[:=—–-][^A-Za-z]{0,4}([A-Za-z][A-Za-z-]{0,31})", "gi");
const CONFIDENCE_LABEL = new RegExp("confidence[^A-Za-z0-9]{0,4}[:=—–-][^A-Za-z]{0,4}([A-Za-z][A-Za-z-]{0,31})", "gi");
const APPROVAL_VERDICT = "approve";
const UNTRUSTED_CONFIDENCE = "low";
const BLOCKING = true;
const BLOCK_EXIT = 2;

const LOCK_ATTEMPTS = 50;
const LOCK_WAIT_MS = 20;
const LOCK_STALE_MS = 30_000;

const NOW = Date.now();

function repoRoot() {
  const cwd = resolve(process.cwd());
  const declared = process.env.STAMITY_REPO_ROOT;
  if (typeof declared !== "string" || declared === "") return cwd;
  const candidate = resolve(cwd, declared);
  const prefix = candidate.endsWith(sep) ? candidate : candidate + sep;
  if (candidate !== cwd && !cwd.startsWith(prefix)) return cwd;
  try {
    if (!statSync(join(candidate, STATE_SEGMENTS[0])).isDirectory()) return cwd;
  } catch {
    return cwd;
  }
  return candidate;
}

const STATE_FILE = join(repoRoot(), ...STATE_SEGMENTS);
const LOCK_FILE = STATE_FILE + ".lock";

function readPayload() {
  let raw = "";
  try {
    raw = readFileSync(0, "utf8");
  } catch {
    return {};
  }
  if (raw.trim() === "") return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed !== null && typeof parsed === "object" ? parsed : {};
  } catch {
    // An unparseable payload names no agent and no tool, so it attributes to
    // nothing this script governs — treated as out of scope, never as a
    // finding, so a client's payload change cannot brick a session.
    return {};
  }
}

function field(payload, names) {
  for (const name of names) {
    const value = Object.hasOwn(payload, name) ? payload[name] : undefined;
    if (typeof value === "string" && value !== "") return value;
  }
  return "";
}

/** One payload value as an object key: id characters only, and bounded. */
function identifier(value) {
  return value.replace(/[^A-Za-z0-9._-]/g, "").slice(0, MAX_ID_CHARS);
}

/** One payload value as a vocabulary word: lower-case letters and hyphens, bounded. */
function word(value) {
  return value.toLowerCase().replace(/[^a-z-]/g, "").slice(0, MAX_WORD_CHARS);
}

/**
 * One word narrowed to a closed vocabulary. Anything outside it is unrecorded
 * rather than stored: the counter file holds what the review loop returned, and
 * a value no verdict can equal is more honest there than a stray token.
 */
function term(value, vocabulary) {
  const normalized = word(value);
  return vocabulary.includes(normalized) ? normalized : "";
}

/**
 * The one value a label carries in the reviewer's final text.
 *
 * Every labelled occurrence is read, not the first or the last: a text that
 * names two different verdicts has not returned one, and picking either would
 * be a guess in a place where guessing wrong releases a completion the loop
 * never approved. Disagreement and absence both read as unrecorded, which holds
 * the round open — bounded by the cap, so the cost is a round.
 */
function labelled(text, pattern, vocabulary) {
  let found = "";
  for (const match of text.matchAll(pattern)) {
    const candidate = term(match[1], vocabulary);
    if (candidate === "") continue;
    if (found !== "" && found !== candidate) return "";
    found = candidate;
  }
  return found;
}

/**
 * One field of the reviewer's structured return.
 *
 * A payload field wins wherever a client carries one — that is the reading
 * nobody has to parse. What the documented payload does carry on a sub-agent
 * stop is the agent's final text, so that is the fallback, scanned only up to
 * the cap: past it the payload is a transcript rather than a return block, and
 * an unbounded scan on every stop is a stall this gate should not offer.
 */
function returned(payload, names, pattern, vocabulary) {
  const direct = term(field(payload, names), vocabulary);
  if (direct !== "") return direct;
  const message = field(payload, MESSAGE_FIELDS);
  if (message === "" || message.length > MAX_MESSAGE_CHARS) return "";
  return labelled(message, pattern, vocabulary);
}

/**
 * The counter document, or the fault that makes it untrustworthy. Sized before
 * it is read, exactly as the sibling guard sizes its policy document: past the
 * cap the file is refused on its size rather than parsed to discover it was
 * unreasonable.
 */
function load() {
  let size = -1;
  try {
    const stats = statSync(STATE_FILE);
    if (stats.isFile()) size = stats.size;
  } catch {
    size = -1;
  }
  if (size <= 0) return { fault: "STATE_ABSENT", runs: null };
  if (size > MAX_STATE_BYTES) return { fault: "STATE_TOO_LARGE", runs: null };

  let raw = "";
  try {
    raw = readFileSync(STATE_FILE, "utf8");
  } catch {
    return { fault: "STATE_UNREADABLE", runs: null };
  }
  let document = null;
  try {
    document = JSON.parse(raw);
  } catch {
    return { fault: "STATE_INVALID", runs: null };
  }
  if (
    document === null ||
    typeof document !== "object" ||
    document.schema !== SCHEMA ||
    document.runs === null ||
    typeof document.runs !== "object"
  ) {
    return { fault: "STATE_INVALID", runs: null };
  }
  return { fault: "", runs: document.runs };
}

/**
 * One run's record, or null when the run has no countable round. Read
 * own-property only: a plain object inherits `constructor` and `toString`, and
 * a run id named after one of those would otherwise resolve to a function.
 */
function entryOf(runs, runId) {
  const value = Object.hasOwn(runs, runId) ? runs[runId] : undefined;
  if (value === null || typeof value !== "object") return null;
  if (!Number.isInteger(value.rounds) || value.rounds < 1) return null;
  return {
    rounds: value.rounds,
    verdict: typeof value.verdict === "string" ? value.verdict : "",
    confidence: typeof value.confidence === "string" ? value.confidence : "",
  };
}

/**
 * Synchronous wait. A hook is a short-lived process with nothing else to do,
 * and there is no event loop here to yield to.
 */
function pause(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Take the counter's exclusive lock, or give up.
 *
 * The lock is what makes the round count correct. Temp+rename replaces the
 * document whole, which is atomic VISIBILITY and nothing more: two sub-agents
 * finishing at once both read round N, both write N+1, and one round is gone.
 * That is not a rounding error — an undercounted loop keeps holding a run it
 * should have released, or reaches the cap a round late.
 *
 * Created O_EXCL, so exactly one process wins the create. A lock older than the
 * stale window belonged to a process that died holding it and is cleared; every
 * other failure gives up rather than forcing, because forcing a live lock is the
 * defect this exists to prevent.
 */
function lock() {
  for (let attempt = 0; attempt < LOCK_ATTEMPTS; attempt += 1) {
    try {
      mkdirSync(dirname(STATE_FILE), { recursive: true });
      closeSync(openSync(LOCK_FILE, FS.O_WRONLY | FS.O_CREAT | FS.O_EXCL | FS.O_NOFOLLOW, 0o600));
      return true;
    } catch (error) {
      if (!error || error.code !== "EEXIST") return false;
      try {
        if (Date.now() - statSync(LOCK_FILE).mtimeMs > LOCK_STALE_MS) unlinkSync(LOCK_FILE);
      } catch {
        // Another process cleared it first; the next attempt takes it.
      }
      pause(LOCK_WAIT_MS);
    }
  }
  return false;
}

function unlock() {
  try {
    unlinkSync(LOCK_FILE);
  } catch {
    // Already gone: a stale-lock sweep in another process got there first.
  }
}

/**
 * Prune by age, then by count, then replace the file whole through temp+rename.
 * Called only while this process holds the lock, so the read this write is
 * based on is still current.
 *
 * The temp name is random and the file is created O_EXCL | O_NOFOLLOW. The old
 * name was the process id in base 36 — a few thousand values, guessable in
 * advance — and it was opened through whatever the name already pointed at, so
 * a symlink planted there redirected the write out of the repo and the rename
 * then made the redirection permanent. A write that cannot land is reported,
 * never raised: the counter is not worth holding a run for.
 */
function save(runs) {
  const kept = Object.entries(runs)
    .filter((pair) => pair[1] !== null && typeof pair[1] === "object" && NOW - pair[1].updated < MAX_RUN_AGE_MS)
    .sort((a, b) => b[1].updated - a[1].updated || (a[0] < b[0] ? -1 : 1))
    .slice(0, MAX_RUNS);
  const temp = STATE_FILE + ".tmp-" + randomBytes(8).toString("hex");
  let handle = -1;
  try {
    mkdirSync(dirname(STATE_FILE), { recursive: true });
    handle = openSync(temp, FS.O_WRONLY | FS.O_CREAT | FS.O_EXCL | FS.O_NOFOLLOW, 0o600);
    writeSync(handle, JSON.stringify({ schema: SCHEMA, runs: Object.fromEntries(kept) }));
    closeSync(handle);
    handle = -1;
    renameSync(temp, STATE_FILE);
    return true;
  } catch {
    if (handle !== -1) {
      try {
        closeSync(handle);
      } catch {
        // Already closed by the failing branch.
      }
    }
    try {
      unlinkSync(temp);
    } catch {
      // Nothing to clean up: the temp file never landed.
    }
    return false;
  }
}

const payload = readPayload();
const runId = identifier(field(payload, ["session_id", "run_id", "sessionId", "runId"]));
const agentId = field(payload, ["agent_type", "subagent_type", "agentType", "subagentType"]);
const eventName = field(payload, ["hook_event_name", "hookEventName", "event"]);

/**
 * Whether this event is a run declaring itself finished — the only kind this
 * gate holds. The client's own event name answers it wherever the payload
 * carries one; otherwise the completing identity does, since a governed
 * sub-agent finishing is a step inside the run rather than the end of it.
 */
function isCompletion() {
  if (eventName !== "") return COMPLETION_EVENTS.includes(eventName);
  return !agentId.startsWith(GOVERNED_PREFIX);
}

/**
 * Count this reviewer's round, under the lock.
 *
 * The counter is read again INSIDE the lock rather than reused from the read
 * that opened this invocation: that earlier copy is exactly the stale read that
 * made this a lock-free read-modify-write, and thirty parallel reviewer stops
 * against it recorded a single round.
 *
 * A lock this process cannot take is reported and the gate opens. Refusing the
 * completion instead would wedge a run over a counter, which is the one thing
 * every other fault path here already refuses to do.
 */
function record() {
  const verdict = returned(payload, ["verdict", "review_verdict", "reviewVerdict"], VERDICT_LABEL, VERDICTS);
  const confidence = returned(
    payload,
    ["confidence", "review_confidence", "reviewConfidence"],
    CONFIDENCE_LABEL,
    CONFIDENCES,
  );

  if (!lock()) {
    return {
      blocked: false,
      runId,
      maxRounds: MAX_ROUNDS,
      reasonCode: "STATE_LOCKED",
      message:
        "The review-gate counter at " + STATE_FILE + " stayed locked, so this round was not counted " +
        "and the gate is open. Remove " + LOCK_FILE + " if no run is in flight.",
    };
  }

  let rounds = 0;
  let stored = false;
  try {
    const current = load();
    // Null prototype for the same reason the completion path uses one: a run id
    // of "__proto__" would otherwise reach the inherited setter and vanish.
    const runs = Object.assign(Object.create(null), current.runs === null ? {} : current.runs);
    const previous = entryOf(runs, runId);
    rounds = (previous === null ? 0 : previous.rounds) + 1;
    runs[runId] = { rounds, verdict, confidence, updated: NOW };
    stored = save(runs);
  } finally {
    unlock();
  }

  return {
    blocked: false,
    runId,
    round: rounds,
    maxRounds: MAX_ROUNDS,
    reasonCode: stored ? "ROUND_RECORDED" : "STATE_UNWRITABLE",
    message: stored
      ? standing(rounds, verdict) + " recorded for this run."
      : standing(rounds, verdict) + " could not be written to " + STATE_FILE + ", so the gate is open.",
  };
}

/** How many rounds this run has left to spend, phrased for the operator. */
function standing(rounds, verdict) {
  return (
    "Review round " + rounds + " of " + MAX_ROUNDS + " (verdict: " + (verdict === "" ? "unrecorded" : verdict) + ")"
  );
}

/** The outcome this event earns, or null when nothing here governs it. */
function decide() {
  // A payload naming no run cannot be attributed to a review loop, and a gate
  // that held it would hold every run this setup never opened.
  if (runId === "") return null;

  const state = load();
  if (state.fault !== "" && state.fault !== "STATE_ABSENT") {
    return {
      blocked: false,
      runId,
      reasonCode: state.fault,
      message:
        "The review-gate counter at " + STATE_FILE + " cannot be trusted, so the gate is open. " +
        "Deleting the file restarts the counter; it is not overwritten from here.",
    };
  }
  // A finishing reviewer IS a review round: count it, record what it returned,
  // and let it go — the round has already happened.
  if (agentId === REVIEWER_AGENT) return record();

  if (!isCompletion()) return null;

  if (state.fault === "STATE_ABSENT") {
    return {
      blocked: false,
      runId,
      reasonCode: "STATE_ABSENT",
      message:
        "No review-gate counter at " + STATE_FILE + ", so the gate is open. " +
        "The file is created when this run records its first review round.",
    };
  }

  // Copied onto a null prototype before anything is read out of it: run ids come
  // from a payload, and a run named after a prototype member would otherwise
  // resolve to an inherited value instead of this run's record.
  const runs = Object.assign(Object.create(null), state.runs === null ? {} : state.runs);
  const entry = entryOf(runs, runId);
  // Work-scoped: a run with no recorded round has no review loop to gate on.
  if (entry === null) return null;
  // An approval closes the loop. Confidence is the flow's own gate and the
  // operator sets where it sits, so the one combination refused here is the one
  // no setting accepts: an approval the reviewer itself called low-confidence.
  if (entry.verdict === APPROVAL_VERDICT && entry.confidence !== UNTRUSTED_CONFIDENCE) return null;

  if (entry.rounds >= MAX_ROUNDS) {
    return {
      blocked: false,
      runId,
      round: entry.rounds,
      maxRounds: MAX_ROUNDS,
      verdict: entry.verdict,
      reasonCode: "CAP_REACHED",
      message:
        standing(entry.rounds, entry.verdict) +
        " is the cap, so the gate is open. The run ends here as BLOCKED_FAILURE with the open findings attached.",
    };
  }
  return {
    blocked: BLOCKING,
    runId,
    round: entry.rounds,
    maxRounds: MAX_ROUNDS,
    verdict: entry.verdict,
    reasonCode: "REVIEW_ROUND_OPEN",
    message:
      standing(entry.rounds, entry.verdict) +
      " left this run without an approval. Next: the open findings go to a fixer and the change re-enters review; " +
      "completion opens on an approval or at round " + MAX_ROUNDS + ".",
  };
}

const outcome = decide();
if (outcome !== null) {
  // Reported, then the process ends on its own. `process.exit` would race the
  // write: stderr is asynchronous when it is a pipe on macOS and the BSDs,
  // which is exactly how a client runs a hook.
  //
  // Every outcome goes to stderr, blocking or not. On a blocking refusal that is
  // a channel the client's own guarantee row names: exit 2 returns stderr to the
  // agent. On an exit-0 outcome — a round recorded, a cap reached, a counter
  // fault — it is NOT: no guarantee row documents a channel for stderr on exit
  // 0, so whether anyone reads these lines is the client's choice. They are kept
  // because a record the client may surface beats no record at all, and because
  // stdout is what feeds a session and a gate decision is not session context.
  // Read them as a log this script emits, never as a notification it delivers.
  process.stderr.write(JSON.stringify({ hook: "stamity-review-gate", ...outcome }) + "\n");
  process.exitCode = outcome.blocked ? BLOCK_EXIT : 0;
}
