#!/usr/bin/env node
// stamity — session-start context load.
//
// Prints the learnings index and the resumable handoffs for this repo by
// reading the state directory directly: no agent is spawned and nothing is
// written. Every file clears a size, injection, integrity and review screen
// before it is LISTED; a file that fails one is named in a skip line with its
// reason, and every field printed — the file name included — is flattened to
// one bounded line first. Bodies and matched spans are never printed.
//
// Generated file — regenerate it rather than editing; local edits are overwritten.
// Trust posture: exec form, repo-committed, no dynamic evaluation, no network reach.
// Reads outside repo state: the wall clock, which decides whether a learning's
// review horizon has passed and whether a handoff has expired. Same repo, two
// different days, two different banners.

import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, sep } from "node:path";

const STATE_SEGMENTS = [".stamity"];
const MAX_ITEM_LINES = 20;
const MAX_LEARNING_BYTES = 65536;
const MAX_HANDOFF_BYTES = 61440;
const MAX_FIELD_CHARS = 200;
const RESUMABLE = ["active","in-progress"];
const INVISIBLE = new RegExp("(?:[\\u00AD\\u034F\\u0600-\\u0605\\u061C\\u06DD\\u070F\\u0890-\\u0891\\u08E2\\u115F-\\u1160\\u17B4-\\u17B5\\u180B-\\u180F\\u200B-\\u200F\\u202A-\\u202E\\u2060-\\u206F\\u3164\\uFE00-\\uFE0F\\uFEFF\\uFFA0\\uFFF0-\\uFFFB]|\\uD804\\uDCBD|\\uD804\\uDCCD|\\uD80D[\\uDC30-\\uDC3F]|\\uD82F[\\uDCA0-\\uDCA3]|\\uD834[\\uDD73-\\uDD7A]|\\uDB40[\\uDC80-\\uDFFF]|[\\uDB41-\\uDB43][\\uDC00-\\uDFFF])", "g");
const SCREEN = [
  { id: "fake-instruction-header", re: new RegExp("^#{1,2}\\s*(?:system\\s+prompt|instructions|you\\s+are|role)\\s*:", "im") },
  { id: "frontmatter-config-override", re: new RegExp("^---[ \\t]*\\n[\\s\\S]{0,2000}?(?:protected|scope|model)\\s*:", "m") },
  { id: "cross-agent-override", re: new RegExp("(?:override|replace|ignore)\\s+(?:agent|rule|skill)\\s+", "i") },
  { id: "managed-block-forgery", re: new RegExp("STAMITY:(?:BEGIN|END)", "") },
  { id: "tool-invocation-markup", re: new RegExp("<(?:tool_use|function_call|antml\\x3ainvoke)\\b", "i") },
  { id: "skip-security-review", re: new RegExp("skip\\s+(?:security|review|audit)", "i") },
  { id: "ignore-findings", re: new RegExp("ignore\\s+(?:all\\s+)?(?:findings|errors|warnings|vulnerabilities)", "i") },
  { id: "disable-security-controls", re: new RegExp("disable\\s+(?:security|review|audit|test)", "i") },
  { id: "exfiltrate", re: new RegExp("exfiltrate", "i") },
  { id: "bypass-security", re: new RegExp("bypass\\s+(?:security|auth|permission|review)", "i") },
  { id: "delete-everything", re: new RegExp("delete\\s+(?:all|everything|repo)", "i") },
  { id: "never-verify", re: new RegExp("never\\s+(?:review|test|check|audit|scan)", "i") },
  { id: "override-security", re: new RegExp("override\\s+(?:all\\s+)?security", "i") },
  { id: "encoded-eval", re: new RegExp("(?:atob|Buffer\\.from)\\s*\\([^)]*(?:eval|exec|require)", "i") },
  { id: "permission-mutation", re: new RegExp("(?:chmod|chown)\\s+[0-7]{3,4}", "i") },
  { id: "inline-secret-assignment", re: new RegExp("(?:api[_-]?key|password|token|secret)\\s*[:=]\\s*.{8,}", "i") },
  { id: "ignore-previous-instructions", re: new RegExp("ignore\\s+(?:all\\s+)?previous\\s+instructions", "i") },
  { id: "disregard-previous", re: new RegExp("disregard\\s+(?:all\\s+)?(?:previous|prior|above)", "i") },
  { id: "role-reassignment", re: new RegExp("you\\s+are\\s+now\\s+(?:a|an|the)\\s", "i") },
  { id: "new-instructions-header", re: new RegExp("new\\s+instructions\\s*:", "i") },
  { id: "system-prompt-header", re: new RegExp("system\\s+prompt\\s*:", "i") },
  { id: "forget-previous", re: new RegExp("forget\\s+(?:all\\s+)?(?:previous|prior|above)\\s+(?:instructions|rules|context)", "i") },
  { id: "act-as-jailbroken", re: new RegExp("act\\s+as\\s+(?:a|an)\\s+(?:unrestricted|unfiltered|jailbroken)", "i") },
  { id: "do-not-follow-previous", re: new RegExp("do\\s+not\\s+follow\\s+(?:any|the|your)\\s+(?:previous|prior|above|original)\\s", "i") },
  { id: "remove-safety-checks", re: new RegExp("remove\\s+(?:all\\s+)?(?:security|safety)\\s+(?:checks|guards|measures)", "i") },
  { id: "execute-untrusted-code", re: new RegExp("(?:execute|run)\\s+(?:arbitrary|untrusted|remote)\\s+(?:code|commands?)", "i") },
  { id: "phone-home", re: new RegExp("(?:connect|phone)\\s+home", "i") },
  { id: "reverse-shell", re: new RegExp("(?:reverse|bind)\\s+shell", "i") },
  { id: "upload-exfil", re: new RegExp("(?:upload|exfil)\\s+(?:to|data|credentials|keys)", "i") },
  { id: "disable-logging", re: new RegExp("(?:disable|turn\\s+off|remove)\\s+(?:logging|monitoring|audit)", "i") },
  { id: "hardcoded-credentials", re: new RegExp("(?:hardcoded|embedded)\\s+(?:credentials?|secrets?|passwords?)", "i") },
  { id: "from-now-on-ignore", re: new RegExp("(?:from\\s+now\\s+on|going\\s+forward),?\\s+(?:ignore|disregard|forget)\\s", "i") },
  { id: "pretend-role", re: new RegExp("pretend\\s+(?:you\\s+are|to\\s+be)\\s+(?:a|an|the)\\s", "i") },
  { id: "reveal-system-prompt", re: new RegExp("(?:reveal|show|display|output)\\s+(?:your|the)\\s+(?:system\\s+)?(?:prompt|instructions|rules)", "i") },
  { id: "jailbreak-mode", re: new RegExp("(?:jailbreak|dan\\s+mode|developer\\s+mode)", "i") },
  { id: "print-system-prompt", re: new RegExp("(?:output|print|write)\\s+(?:the|your)\\s+(?:initial|original|system)\\s+(?:prompt|instructions)", "i") },
  { id: "authority-tier-escalation", re: new RegExp("(?:takes?\\s+precedence\\s+over|overrides?|supersedes?|superc[ei]des?)\\s+(?:the\\s+|all\\s+|any\\s+|your\\s+)*(?:system|developer|project|framework|security|agent|prior|above|previous)\\s+(?:instruction|rule|prompt|polic|setting|requirement|directive|config|context)", "i") },
  { id: "treat-as-system-authority", re: new RegExp("treat\\s+(?:this|that|the\\s+following|it|these)\\s+(?:as\\s+)?(?:a\\s+|an\\s+)?(?:system|developer|higher[\\s-]?(?:tier|priority|authority|trust)|elevated|privileged)\\s+(?:instruction|prompt|rule|command|message|directive|authority|tier)", "i") },
  { id: "role-must-always", re: new RegExp("\\b(?:implementer|reviewer|planner|orchestrator|fixer|researcher|loader|the\\s+(?:agent|assistant|model|llm|ai|bot|system))\\b[^.\\n]{0,40}\\bmust\\s+always\\b", "i") },
  { id: "cross-agent-directive", re: new RegExp("\\bwhen\\s+(?:the\\s+)?(?:implementer|reviewer|planner|orchestrator|fixer|researcher|agent|assistant|model|llm|ai)\\b[^.\\n]{0,30}\\b(?:runs?|reads?|loads?|sees?|processes?|executes?)\\b[^.\\n]{0,40}\\b(?:ignore|skip|disable|bypass|delete|remove|overrides?|exfiltrate|reveal|forget|disregard|never|do\\s+not|must\\s+always)\\b", "i") },
  { id: "role-colon-injection", re: new RegExp("(?:^|\\n)\\s*(?:system|assistant|user)\\s*:\\s*$", "im") },
  { id: "chat-template-tokens", re: new RegExp("\\[INST\\]|\\[\\/INST\\]|<\\|im_start\\|>|<\\|im_end\\|>", "i") },
  { id: "template-injection", re: new RegExp("<%[-=]?\\s|%>(?!%)|\\{\\{[^{}]*\\}\\}", "") },
  { id: "html-comment-role-escalation", re: new RegExp("<!--\\s*(?:SYSTEM|ADMIN|ROOT)\\s*-->", "i") },
  { id: "control-char-injection", re: new RegExp("\\x00|\\x1b\\[", "") },
  { id: "tool-call-injection", re: new RegExp("(?:tool_call|function_call)\\s*\\(", "i") },
  { id: "tool-delimiter-token", re: new RegExp("<\\|(?:tool|function|plugin)\\|>", "i") },
  { id: "unicode-tag-smuggling", re: new RegExp("\\uDB40[\\uDC00-\\uDC7F]", "") },
  { id: "base64-instruction-override", re: new RegExp("(?:SWdub3JlIGFsbCBwcmV2aW91cyBpbnN0cnVjdGlvbnM|aWdub3JlIGFsbCBwcmV2aW91cyBpbnN0cnVjdGlvbnM|SWdub3JlIHByZXZpb3VzIGluc3RydWN0aW9ucw|aWdub3JlIHByZXZpb3VzIGluc3RydWN0aW9ucw|RGlzcmVnYXJkIHByZXZpb3VzIGluc3RydWN0aW9ucw|ZGlzcmVnYXJkIHByZXZpb3VzIGluc3RydWN0aW9ucw|U3lzdGVtIHByb21wdDo|c3lzdGVtIHByb21wdDo|WW91IGFyZSBub3c|eW91IGFyZSBub3c|Rm9yZ2V0IGFsbCBwcmV2aW91cw|Zm9yZ2V0IGFsbCBwcmV2aW91cw|QWN0IGFzIGFu|YWN0IGFzIGFu)", "") },
  { id: "error-frame-override", re: new RegExp("(?:error|exception|warning|debug|stderr|traceback|panic)[\\s:=-]{1,4}[^\\n]{0,80}(?:reveal|print|output|dump|show|leak|expose|display)\\s+(?:the\\s+|your\\s+)?(?:system\\s+prompt|prompt|instructions?|context|secrets?|tokens?|keys?)", "i") },
];

const CONFUSABLES = {"304":"I","305":"i","593":"a","603":"e","609":"g","611":"y","617":"i","618":"I","628":"N","640":"R","651":"v","655":"Y","665":"B","668":"H","671":"L","895":"J","913":"A","914":"B","917":"E","918":"Z","919":"H","921":"I","922":"K","924":"M","925":"N","927":"O","929":"P","932":"T","933":"Y","935":"X","945":"a","946":"b","947":"y","949":"e","950":"z","951":"n","953":"i","954":"k","957":"v","959":"o","961":"p","962":"c","964":"t","965":"u","967":"x","969":"w","1011":"j","1029":"S","1030":"I","1032":"J","1040":"A","1042":"B","1045":"E","1050":"K","1052":"M","1053":"H","1054":"O","1056":"P","1057":"C","1058":"T","1059":"Y","1061":"X","1068":"b","1072":"a","1074":"b","1075":"r","1077":"e","1082":"k","1084":"m","1086":"o","1088":"p","1089":"c","1090":"t","1091":"y","1093":"x","1100":"b","1109":"s","1110":"i","1112":"j","1140":"V","1141":"v","1198":"Y","1210":"H","1211":"h","1216":"I","1231":"l","1280":"D","1281":"d","1292":"G","1293":"g","1306":"Q","1307":"q","1308":"W","1309":"w","1340":"L","1357":"U","1365":"O","1379":"q","1382":"q","1386":"d","1388":"l","1392":"h","1397":"j","1400":"n","1405":"u","1409":"g","1413":"o"};
const NON_ASCII = /[\u0080-\uFFFF]/;
const WORD_ADJACENT_MASK = /(?<=[A-Za-z])[\u0080-\uFFFF]+|[\u0080-\uFFFF]+(?=[A-Za-z])/g;

/** Cross-script lookalikes mapped to ASCII, over the NFKC form. */
function foldConfusables(text) {
  if (!NON_ASCII.test(text)) return text;
  const normalized = text.normalize("NFKC");
  let out = "";
  let cursor = 0;
  for (let index = 0; index < normalized.length; index += 1) {
    const key = String(normalized.charCodeAt(index));
    if (!Object.hasOwn(CONFUSABLES, key)) continue;
    out += normalized.slice(cursor, index) + CONFUSABLES[key];
    cursor = index + 1;
  }
  return cursor === 0 ? normalized : out + normalized.slice(cursor);
}

/** Rejoin a keyword split by a mask the fold table does not carry. */
function joinMaskedWords(text) {
  if (!NON_ASCII.test(text)) return text;
  return text.normalize("NFKD").replace(WORD_ADJACENT_MASK, "");
}

/** Fold first, then join: the join inherits the fold's substitutions. */
function normalizeForScreen(text) {
  return joinMaskedWords(foldConfusables(text));
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

const STATE_ROOT = join(repoRoot(), ...STATE_SEGMENTS);

/** `.md` entries in a directory. Absent or unreadable both read as empty. */
function listMarkdown(dir) {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

/**
 * One document, screened. Checks run in the order that keeps a refusal
 * attributable: size before read, injection before shape, then shape, then
 * integrity — so a poisoned file reports as poisoned rather than as malformed.
 */
function inspect(dir, name, maxBytes, coversSummary) {
  let stats;
  try {
    stats = statSync(join(dir, name));
  } catch {
    return null;
  }
  if (!stats.isFile()) return null;
  const doc = { name, size: stats.size, mtime: stats.mtimeMs, skip: "", head: null };
  if (stats.size > maxBytes) return { ...doc, skip: "over-size" };

  let raw;
  try {
    raw = readFileSync(join(dir, name), "utf8");
  } catch {
    return { ...doc, skip: "invalid-frontmatter" };
  }
  if (screened(raw)) return { ...doc, skip: "injection-detected" };
  const parsed = parseDocument(raw);
  if (parsed === null) return { ...doc, skip: "invalid-frontmatter" };
  const covered = coversSummary
    ? String(parsed.head.summary ?? "").trim() + "\n" + parsed.body.trim()
    : parsed.body.trim();
  if (!integrityHolds(parsed.head.integrity, covered)) {
    return { ...doc, skip: "integrity-mismatch" };
  }
  return { ...doc, head: parsed.head };
}

/**
 * The screen, run over every copy the engine's own gates run it over: the raw
 * text, the invisible-stripped copy, and the composed normalization of that
 * copy. A union, never a replacement — the normalized copy adds the refusals a
 * lookalike or a combining mark hid, and the raw copy keeps the ones NFKC
 * destroys by composing a trailing mark into the letter before it.
 */
function screened(raw) {
  const stripped = raw.replace(INVISIBLE, "");
  const copies = [raw, stripped];
  const normalized = normalizeForScreen(stripped);
  if (normalized !== stripped) copies.push(normalized);
  return SCREEN.some((entry) =>
    copies.some((copy) => {
      // A `g`-flagged row carries `lastIndex` between calls, and this now tests
      // three copies per row: without the reset the second copy would resume
      // mid-string and a hit could fall through.
      entry.re.lastIndex = 0;
      return entry.re.test(copy);
    }),
  );
}

/**
 * Fenced head plus body. Top-level scalars only — nested keys are indented and
 * ignored — but every SCALAR SHAPE the engine's own writer emits is read, not
 * just the bare one.
 *
 * The writer serializes through a YAML library, so a value carrying a newline
 * comes back as a block scalar and a value carrying a quote or a leading
 * indicator comes back double-quoted with escapes. A per-line regex that took
 * the raw remainder read a block scalar's own indicator (`|-`) as the value:
 * a garbage banner line for a learning, and for a handoff a SILENT DROP,
 * because the summary is inside the span the integrity digest covers and the
 * mis-parse failed it.
 */
function parseDocument(raw) {
  const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  const match = /^---[ \t]*\r?\n(?:([\s\S]*?)\r?\n)?---[ \t]*(?:\r?\n([\s\S]*))?$/.exec(text);
  if (match === null) return null;
  const head = Object.create(null);
  const lines = (match[1] ?? "").split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const pair = /^([A-Za-z][A-Za-z0-9_-]*)[ \t]*:[ \t]*(.*)$/.exec(lines[index]);
    if (pair === null) continue;
    const rest = pair[2].trim();
    const block = /^([|>])([0-9]*)([-+]?)$|^([|>])([-+]?)([0-9]*)$/.exec(rest);
    if (block === null) {
      head[pair[1]] = unquote(rest);
      continue;
    }
    const style = block[1] ?? block[4];
    const chomp = block[3] || block[5] || "";
    const collected = [];
    while (index + 1 < lines.length) {
      const next = lines[index + 1];
      // A blank line belongs to the block; anything at column 0 ends it.
      if (next.trim() !== "" && !/^[ \t]/.test(next)) break;
      collected.push(next);
      index += 1;
    }
    head[pair[1]] = blockScalar(collected, style, chomp);
  }
  return { head, body: match[2] ?? "" };
}

/**
 * A block scalar's value: strip the block's own indentation (the first
 * non-empty line sets it), join literal style with newlines and folded style by
 * the fold rule, then apply chomping — strip, keep, or the default clip.
 */
function blockScalar(collected, style, chomp) {
  const first = collected.find((line) => line.trim() !== "");
  if (first === undefined) return "";
  const indent = (/^[ \t]*/.exec(first) ?? [""])[0].length;
  const rows = collected.map((line) => (line.trim() === "" ? "" : line.slice(indent)));
  let value = "";
  if (style === "|") {
    value = rows.join("\n");
  } else {
    // Folded: a single break between two non-empty lines becomes a space; a
    // blank line stays a break.
    for (let index = 0; index < rows.length; index += 1) {
      if (index === 0) value = rows[index];
      else if (rows[index] === "" || rows[index - 1] === "") value += "\n" + rows[index];
      else value += " " + rows[index];
    }
  }
  if (chomp === "-") return value.replace(/\n+$/, "");
  if (chomp === "+") return value + "\n";
  return value.replace(/\n+$/, "") + "\n";
}

/** One quoted scalar, unescaped the way the writer escaped it. */
function unquote(value) {
  if (value.length > 1 && value.startsWith('"') && value.endsWith('"')) {
    return value
      .slice(1, -1)
      .replace(/\\u([0-9a-fA-F]{4})/g, (whole, code) => String.fromCharCode(parseInt(code, 16)))
      .replace(/\\([\s\S])/g, (whole, char) =>
        char === "n" ? "\n" : char === "t" ? "\t" : char === "r" ? "\r" : char === "0" ? "\u0000" : char,
      );
  }
  if (value.length > 1 && value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replaceAll("''", "'");
  }
  return value;
}

/**
 * The digest vouches for the bytes it covers; an absent or stale one is a
 * refusal. The covered span arrives already trimmed and assembled, because the
 * two document kinds cover different spans: a handoff's digest includes its
 * summary (the first line the resuming agent reads is content, not metadata),
 * a learning's does not.
 */
function integrityHolds(declared, covered) {
  if (typeof declared !== "string" || !/^sha256:[0-9a-f]{64}$/i.test(declared)) return false;
  return (
    declared.toLowerCase() === "sha256:" + createHash("sha256").update(covered, "utf8").digest("hex")
  );
}

/**
 * One field as a single index-safe line: control characters and newlines
 * collapse, so a forged summary cannot manufacture index lines of its own.
 */
function text(value, fallback) {
  if (typeof value !== "string") return fallback;
  const flat = value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  if (flat === "") return fallback;
  return flat.length > MAX_FIELD_CHARS ? flat.slice(0, MAX_FIELD_CHARS - 1) + "…" : flat;
}

function stem(name) {
  return name.slice(0, -3);
}

/** Appends at most MAX_ITEM_LINES items, then one line accounting for the rest. */
function append(out, items, noun) {
  for (const item of items.slice(0, MAX_ITEM_LINES)) out.push(item);
  const rest = items.length - MAX_ITEM_LINES;
  if (rest > 0) {
    out.push("- … and " + rest + " more " + noun + (rest === 1 ? "" : "s") + " not listed.");
  }
}

const learningsDir = join(STATE_ROOT, "learnings");
const learnings = listMarkdown(learningsDir)
  .map((name) => inspect(learningsDir, name, MAX_LEARNING_BYTES, false))
  .filter((doc) => doc !== null)
  // Newest first — a learning written today outranks one from six months ago —
  // with a name tiebreak so equal timestamps still order deterministically.
  .sort((a, b) => b.mtime - a.mtime || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

for (const doc of learnings) {
  if (doc.skip !== "") continue;
  const reviewBy = doc.head.reviewBy;
  // The write gate only warns on a passed horizon; reading refuses. Nobody
  // re-verified the claim, and the digest vouches for the bytes, not the finding.
  if (typeof reviewBy === "string" && Date.parse(reviewBy + "T23:59:59.999Z") < NOW) {
    doc.skip = "expired-review";
  }
}

const loaded = learnings.filter((doc) => doc.skip === "");
const skipped = learnings.filter((doc) => doc.skip !== "");

const handoffsDir = join(STATE_ROOT, "handoffs");
const handoffDocs = listMarkdown(handoffsDir)
  .map((name) => inspect(handoffsDir, name, MAX_HANDOFF_BYTES, true))
  .filter((doc) => doc !== null);

// Partitioned, not filtered away. A refusal and a handoff that is merely
// finished or expired are different facts: the first is a file that failed a
// trust screen and has to be reported, the second is ordinary lifecycle and is
// silent. Folding both into the selection expression left two poisoned handoffs
// reported as "none in this repo".
const refusedHandoffs = handoffDocs.filter((doc) => doc.skip !== "");
const handoffs = handoffDocs
  .filter(
    (doc) => doc.skip === "" && RESUMABLE.includes(doc.head.status) && Date.parse(doc.head.expires) > NOW,
  )
  .map((doc) => ({
    id: text(doc.head.id, text(stem(doc.name), "(unnamed)")),
    summary: text(doc.head.summary, "(no summary)"),
    expires: text(doc.head.expires, ""),
    from: text(doc.head.fromTool, ""),
  }))
  // Soonest expiry first: the entry that goes stale next is the one to resume.
  .sort((a, b) => Date.parse(a.expires) - Date.parse(b.expires) || (a.id < b.id ? -1 : 1));

function render() {
  if (learnings.length === 0 && handoffDocs.length === 0) {
    return ["Stamity: no learnings and no resumable handoffs in this repo yet."];
  }

  const bytes = loaded.reduce((total, doc) => total + doc.size, 0);
  // The file name is payload too: it is attacker-chosen on any file that
  // reached the directory, and it is concatenated into a line an agent reads.
  const ids = loaded.map((doc) => text(doc.head.id, text(stem(doc.name), "(unnamed)")));
  const duplicated = new Set(ids.filter((id, index) => ids.indexOf(id) !== index));
  const out = [
    "Learnings: " + loaded.length + " loaded, " + skipped.length + " skipped, " + bytes + " bytes.",
  ];

  append(
    out,
    loaded.map((doc, index) => {
      const id = ids[index];
      const confidence = text(doc.head.confidence, "unrated");
      const summary = text(doc.head.summary, "(no summary)");
      const flag = duplicated.has(id) ? " [duplicate id]" : "";
      return "- [" + confidence + "] " + id + " — " + summary + " (" + fileName(doc) + ")" + flag;
    }),
    "learning",
  );
  append(out, skipped.map(skipLine), "skipped file");

  out.push(
    "Handoffs: " + handoffs.length + " active, " + refusedHandoffs.length + " skipped.",
  );
  append(
    out,
    handoffs.map((entry) => {
      const origin = entry.from === "" ? "" : "from " + entry.from + ", ";
      return "- " + entry.id + " — " + entry.summary + " (" + origin + "expires " + entry.expires + ")";
    }),
    "handoff",
  );
  append(out, refusedHandoffs.map(skipLine), "skipped file");

  return out;
}

/** One skip line: the file by name, the reason by id. The span is never echoed. */
function skipLine(doc) {
  return "- skipped " + fileName(doc) + ": " + doc.skip;
}

/** A file name as one bounded, control-character-free line. */
function fileName(doc) {
  return text(doc.name, "(unnamed file)");
}

// Written once, then the process ends on its own. `process.exit` would race
// the write: stdout is asynchronous when it is a pipe on macOS and the BSDs,
// which is exactly how a client runs a hook.
process.stdout.write(render().join("\n") + "\n");
