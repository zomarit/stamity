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

/*
 * Waiting for the counter's lock.
 *
 * The budget used to be 50 attempts x a flat 20 ms sleep — one second of wall
 * clock, whatever was ahead in the queue. That conflates the two reasons a lock
 * is not free. A holder AHEAD of this process in a queue is progress and must be
 * waited out; the wait is bounded by the queue, not by a constant. A holder that
 * died still holding it is not progress and no amount of waiting helps. One
 * second bounded the first case at a number picked for the second, so thirty
 * reviewers finishing together on a filesystem where each critical section costs
 * more than ~33 ms (NTFS create+delete, an on-access scanner, a runner
 * oversubscribed thirty ways) exhausted it before their turn came, and the round
 * they were holding the lock to count was dropped on a path that still exits 0.
 * Measured against the emitted script with the critical section padded to 40 ms:
 * 27 of 30 rounds landed, the other three reported STATE_LOCKED and exited 0.
 *
 * So the wait watches for PROGRESS instead of counting ticks: every observed
 * change of holder re-arms the idle window, and the process gives up only after
 * LOCK_IDLE_POLLS consecutive looks that saw the same holder AND LOCK_IDLE_MS of
 * wall clock with no hand-off. Both conditions, because either alone is wrong on
 * a loaded machine — a process descheduled past the wall-clock window would
 * otherwise give up having looked exactly once, which is the starvation case
 * this is most likely to meet. LOCK_CEILING_MS bounds the whole wait regardless,
 * so a pathological hand-off storm still terminates.
 *
 * That ceiling is the one constant here that is NOT queue-shaped, and it is
 * checked unconditionally — it overrides the progress detector, so a wait that
 * is demonstrably draining gives up anyway once it fires. At 10s it was
 * therefore still the binding constraint on the exact case the progress
 * detector was added for. Thirty reviewers finishing together serialise; the
 * tail one needs twenty-nine critical sections' worth of wall clock; 10s split
 * twenty-nine ways is ~330ms per section, which an NTFS
 * create+read+rename+unlink cycle behind an on-access scanner on an
 * oversubscribed runner reaches. It did reach it — the herd case dropped one
 * round of thirty on the windows leg with no source change between runs, on
 * the same STATE_LOCKED path that still exits 0.
 *
 * 25s instead, derived from the budget rather than from a guess about how long
 * a queue is. This script rides SubagentStop and TaskCompleted, and it is
 * wired with no per-entry timeout, so it inherits the client default for those
 * events: 600s (code.claude.com/docs/en/hooks-guide, Limitations, accessed
 * 2026-09-01). What the number buys is ~860ms per critical section at thirty
 * writers instead of ~330ms.
 *
 * Read the margin as the ceiling PLUS the retry budgets, not as the ceiling.
 * The ceiling bounds the wait for the lock and nothing after it, and the
 * reviewer's path spends four more budgets inside one invocation: the ceiling
 * itself plus a final jittered pause (25,024 ms), the counter read under the
 * lock (a stat and a read, 300 ms each), the publish rename (win32 3,750 ms of
 * base delay at up to a quarter of jitter = 4,687.5 ms; 750 ms on POSIX) and
 * the unlock (300 ms). That totals ~30.6s on win32 and ~26.7s on POSIX against
 * the 600s the wired events allow — 5.1% of it, with no breach anywhere on the
 * shipped surface. What it does rule out is the earlier claim here that the
 * wait also fits the 30s the same client allows its tightest hook class:
 * re-wiring this gate onto that class now needs LOCK_CEILING_MS lowered first,
 * because the compound worst case has overtaken that budget even though the
 * ceiling alone still sits inside it.
 *
 * Raising it costs nothing on the failure it does not govern. A holder that
 * DIED holding the lock produces no hand-off, so the idle detector returns in
 * ~1s and the ceiling is never consulted; the ceiling only ever fires while
 * the lock is genuinely changing hands, and waiting longer for a queue that is
 * visibly draining is the whole point of watching for progress. The fail-open
 * drop is unchanged either way: a wait that does expire still reports
 * STATE_LOCKED and exits 0, because a counter is not worth wedging a run over.
 */
const LOCK_IDLE_MS = 1_000;
const LOCK_IDLE_POLLS = 24;
const LOCK_CEILING_MS = 25_000;
const LOCK_WAIT_MIN_MS = 4;
const LOCK_WAIT_MAX_MS = 24;
const LOCK_STALE_MS = 30_000;

/*
 * Errnos this script waits out rather than reads as an answer.
 *
 * Every one of them means the same thing on Windows: somebody else is holding
 * the name for a moment. ERROR_ACCESS_DENIED and ERROR_SHARING_VIOLATION reach
 * node as EPERM and EBUSY, EACCES is the third code that family of access
 * refusals arrives under, and a name being unlinked stays delete-pending until
 * the last handle on it closes. An on-access scanner opens every freshly
 * written file on a CI runner without FILE_SHARE_DELETE, and this script
 * creates, reads, renames and unlinks three names in the same directory.
 *
 * None of the three is an answer about whether the lock is free or whether the
 * counter is readable, and every site that read one as an answer dropped a
 * round while exiting 0. On POSIX none of them can come from contention at all:
 * open(O_CREAT|O_EXCL) answers EEXIST, rename(2) is defined on the inode and
 * never loses to a reader, and unlink is atomic. So the same set applies on
 * both platforms, and what it costs on POSIX is the wait budget on a durable
 * fault the gate already fails open on.
 */
const SHARING_FAULTS = ["EACCES", "EBUSY", "EPERM"];
const IS_WINDOWS = process.platform === "win32";

/*
 * Rename retries for a destination held across the publish, carried from the
 * engine's own writer rather than re-derived: see RENAME_RETRY_DELAYS_MS in
 * src/merge/atomicWrite.ts, where the concurrent-reader case took ~790 ms on
 * the runs it passed and spent the whole 750 ms four-retry budget on the runs
 * it failed. This script shipped that pre-fix budget; it now carries the same
 * schedule the engine settled on — 3750 ms of base delay on win32, flattened at
 * 800 ms so a quarter of jitter keeps the ceiling near 4.7 s, and the original
 * 750 ms on POSIX where a longer budget buys a slower failure rather than a
 * landed write. Unretried, a held destination lands as STATE_UNWRITABLE: the
 * round is reported but never stored, which is the same lost round the lock
 * exists to prevent, reached by the other door.
 */
const RENAME_WAITS_MS = IS_WINDOWS ? [50, 100, 200, 400, 600, 800, 800, 800] : [50, 100, 200, 400];
const RENAME_JITTER = IS_WINDOWS ? 0.25 : 0;

/* Retries for a read or an unlink that lost to the same family of holds. Both
 * are short operations on a name this process is racing its own peers for, so
 * the budget is 20+40+80+160 = 300 ms rather than the rename's: past that the
 * hold is not the millisecond-scale one this waits out. */
const RETRY_ATTEMPTS = 4;
const RETRY_BACKOFF_MS = 20;

/** Whether an errno is one of the momentary holds above, rather than an answer. */
function sharing(error) {
  return error !== null && error !== undefined && SHARING_FAULTS.includes(error.code);
}

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
  // Absence and a fault are different answers, and the stat is where they used
  // to be collapsed: every errno mapped to "no file", which the caller reads as
  // "no runs yet". Under the lock that publishes a one-round document over every
  // round counted so far — the silent reset the fault guard below exists to
  // prevent, reached through the one door it did not cover. So only ENOENT, and
  // a name that is not a regular file, is absence; a momentary hold is waited
  // out on the same 20/40/80/160 ms schedule the read uses, and any other errno
  // is STATE_UNREADABLE, which drops the round rather than resetting it.
  let size = -1;
  for (let attempt = 0; ; attempt += 1) {
    try {
      const stats = statSync(STATE_FILE);
      size = stats.isFile() ? stats.size : 0;
      break;
    } catch (error) {
      if (error !== null && error !== undefined && error.code === "ENOENT") break;
      if (!sharing(error) || attempt >= RETRY_ATTEMPTS) return { fault: "STATE_UNREADABLE", runs: null };
      pause(RETRY_BACKOFF_MS * 2 ** attempt);
    }
  }
  if (size <= 0) return { fault: "STATE_ABSENT", runs: null };
  if (size > MAX_STATE_BYTES) return { fault: "STATE_TOO_LARGE", runs: null };

  // Retried on a momentary hold and on nothing else. The publish is
  // temp+rename, so a reader is never handed partial bytes: a parse that fails
  // or a size past the cap is what the file SAYS, and waiting cannot change it.
  // A read that loses to a hold has been told nothing yet, and reading that as
  // STATE_UNREADABLE drops the round this invocation came to count.
  let raw = "";
  for (let attempt = 0; ; attempt += 1) {
    try {
      raw = readFileSync(STATE_FILE, "utf8");
      break;
    } catch (error) {
      if (!sharing(error) || attempt >= RETRY_ATTEMPTS) return { fault: "STATE_UNREADABLE", runs: null };
      pause(RETRY_BACKOFF_MS * 2 ** attempt);
    }
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
 *
 * Who holds it is the progress signal, read as the (mtime, file index) pair the
 * stat already fetched: both are set when the lock is created, so a pair that
 * differs from the last look means the lock changed hands and the queue ahead of
 * this process is draining. The directory is created once, before the loop,
 * rather than on every attempt — under contention that syscall ran on every tick
 * of every waiter, lengthening the poll cycle it was competing in.
 */
function lock() {
  try {
    mkdirSync(dirname(STATE_FILE), { recursive: true });
  } catch {
    return false;
  }
  const ceiling = Date.now() + LOCK_CEILING_MS;
  let idleDeadline = Date.now() + LOCK_IDLE_MS;
  let idlePolls = 0;
  let holder = -1;
  let holderNode = -1;
  for (;;) {
    try {
      closeSync(openSync(LOCK_FILE, FS.O_WRONLY | FS.O_CREAT | FS.O_EXCL | FS.O_NOFOLLOW, 0o600));
      return true;
    } catch (error) {
      // EEXIST is the answer "somebody holds it", and a sharing fault is no
      // answer at all — the name was momentarily unopenable, most often because
      // the previous holder's unlink left it delete-pending. Both go round the
      // loop; every other errno is this filesystem's own refusal and gives up.
      // A name that stays unopenable therefore costs the idle window instead of
      // returning at once — 1.05s measured on darwin against a lock create
      // rigged to raise EACCES every time, against 31ms before — and still ends
      // fail-open at STATE_LOCKED with nothing written.
      if (!error || (error.code !== "EEXIST" && !sharing(error))) return false;
    }

    // Who holds it now, and since when. A stat that raises is a lock released
    // between the open and the look, which is itself a hand-off. Identity is
    // the pair, not the timestamp alone: mtime carries it on any filesystem
    // that stamps sub-second, and the file index carries it on one that does
    // not (exFAT stamps in whole seconds, and two holders inside one tick would
    // otherwise read as one). Either half moving is a hand-off; if a filesystem
    // supplies neither, this degrades to the flat budget it replaced and never
    // below it.
    let seen = -1;
    let node = -1;
    try {
      const held = statSync(LOCK_FILE);
      seen = held.mtimeMs;
      node = Number(held.ino);
    } catch {
      seen = -1;
      node = -1;
    }
    if (seen !== holder || node !== holderNode) {
      holder = seen;
      holderNode = node;
      idleDeadline = Date.now() + LOCK_IDLE_MS;
      idlePolls = 0;
    } else {
      idlePolls += 1;
    }

    // A holder older than the stale window died holding it. Clearing it is the
    // only path that forces a lock, and it is gated on age for that reason.
    if (seen !== -1 && Date.now() - seen > LOCK_STALE_MS) {
      try {
        unlinkSync(LOCK_FILE);
        continue;
      } catch {
        // Another process cleared it first; the next attempt takes it.
      }
    }

    const now = Date.now();
    if (now >= ceiling) return false;
    if (idlePolls >= LOCK_IDLE_POLLS && now >= idleDeadline) return false;
    // Jittered, so a herd woken by the same release does not re-collide on the
    // same tick every round and starve its own tail.
    pause(LOCK_WAIT_MIN_MS + Math.floor(Math.random() * (LOCK_WAIT_MAX_MS - LOCK_WAIT_MIN_MS + 1)));
  }
}

/**
 * Release the lock, retrying the holds that are not a refusal.
 *
 * A swallowed unlink is not one round: it strands the name for the stale window
 * (LOCK_STALE_MS), and no waiter already in the herd can clear it, because
 * LOCK_STALE_MS is longer than LOCK_CEILING_MS and every waiter's ceiling is
 * armed from its own start. So the sweep only ever rescues a LATER invocation,
 * and one dropped unlink costs every remaining round in this run rather than
 * this one. Anything else — the file already gone to a stale sweep in another
 * process — is the same outcome as a release and returns.
 */
function unlock() {
  for (let attempt = 0; ; attempt += 1) {
    try {
      unlinkSync(LOCK_FILE);
      return;
    } catch (error) {
      if (!sharing(error) || attempt >= RETRY_ATTEMPTS) return;
      pause(RETRY_BACKOFF_MS * 2 ** attempt);
    }
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
    // The rename is retried on the errnos Windows raises when something else
    // holds a handle to the destination for a moment — a concurrent reader, or
    // an on-access scanner that opened it without FILE_SHARE_DELETE. The
    // schedule runs out when RENAME_WAITS_MS does, so the budget is the array
    // and there is no second count to drift from it. Every other failure is
    // raised on the first try and reported by the catch below, because a write
    // that cannot land is not worth holding a run for.
    for (let attempt = 0; ; attempt += 1) {
      try {
        renameSync(temp, STATE_FILE);
        break;
      } catch (error) {
        const wait = RENAME_WAITS_MS[attempt];
        if (!sharing(error) || wait === undefined) throw error;
        pause(wait + Math.floor(Math.random() * wait * RENAME_JITTER));
      }
    }
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
    // A fault under the lock is not "no runs". Treating it as one makes
    // `rounds` 1 and publishes a one-round document over a file this script was
    // told not to repair — every round counted so far, gone, on a path that
    // exits 0. So the round is dropped instead and the fault is named. The
    // return sits inside the try, so the finally below still releases the lock.
    //
    // The wording is the unlocked path's, deliberately: this branch is the only
    // report a reviewer ever sees, since the round is counted before the
    // unlocked read that used to carry it. "Cannot be trusted" rather than
    // "could not be read" because STATE_INVALID parsed a file it did read, and
    // the delete sentence is what the operator needs — one remedy for one
    // fault, whichever path names it.
    if (current.fault !== "" && current.fault !== "STATE_ABSENT") {
      return {
        blocked: false,
        runId,
        maxRounds: MAX_ROUNDS,
        reasonCode: current.fault,
        message:
          "The review-gate counter at " + STATE_FILE + " cannot be trusted, so this round was not " +
          "counted and the gate is open. Deleting the file restarts the counter; it is not " +
          "overwritten from here.",
      };
    }
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

  // A finishing reviewer IS a review round: count it, record what it returned,
  // and let it go — the round has already happened. Answered BEFORE the read
  // below, because `record()` re-reads the counter under the lock and never
  // looks at this one: on the reviewer's path the unlocked read decided
  // nothing and could only lose the round, since a read that momentarily lost
  // to another writer's publish returned here instead of reaching the lock.
  // The fault it used to shield `record()` from is handled under the lock now.
  if (agentId === REVIEWER_AGENT) return record();

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
