import { describe, expect, it } from "vitest";
import {
  parseStateBlock,
  requestMarker,
  reviewToolVerdict,
  type ReviewToolFacts,
  type ReviewToolState,
} from "../../src/runs/reviewTool.ts";
import type { ReviewToolConfig } from "../../src/types/manifest.ts";

/**
 * The review tool's verdict (REQ-FLOW-154). The two bodies below are the head of the state comment Codex really left on
 * this repository's pull requests, cut short: #129 is a clean pass and #124 a pass with findings. The tool edits one comment
 * in place, so that comment's `created_at` can sit a day before the run it reports, and the wait is timed from the request.
 * Read from GitHub on 2026-11-04: #129's body names the marker exactly once, and the tool is that comment's last editor.
 */

const CLEAN_HEAD = "1e9ab6ae84a5fcaed1fedbb938958031fab70912";
const FINDINGS_HEAD = "f9abc9c6fdb8c55c6995d67511079a621c5996e1";
const OTHER_HEAD = "2ce31e5a9fe3e5e302b47cc7f92cd4fed655665a";

const NULL_SECTION = `{"commit_sha":null,"has_any_findings":null,"has_unresolved_findings":null,"status":null}`;

const CLEAN_BODY = [
  "<!-- codex-pull-request-review-summary -->",
  `<!-- codex-review-state:v1 {"code_review":{"commit_sha":"${CLEAN_HEAD}","has_any_findings":false,"has_unresolved_findings":false,"status":"completed"},"security_review":${NULL_SECTION}} -->`,
  "",
  "## Codex Review Summary",
].join("\n");

const FINDINGS_BODY = [
  "<!-- codex-pull-request-review-summary -->",
  `<!-- codex-review-state:v1 {"code_review":{"commit_sha":"${FINDINGS_HEAD}","has_any_findings":true,"has_unresolved_findings":true,"status":"completed"},"security_review":${NULL_SECTION}} -->`,
  "",
  "## Codex Review Summary",
].join("\n");

const TOOL: ReviewToolConfig = {
  login: "chatgpt-codex-connector[bot]",
  request: "@codex review",
  clean: "state-comment",
  stateMarker: "codex-review-state:v1",
  stateSection: "code_review",
  waitMinutes: 40,
  rounds: 2,
};

const REQUESTED_AT = "2026-10-27T12:00:00Z";
const REQUESTED_MS = Date.parse(REQUESTED_AT);
const MINUTE = 60_000;

type Comment = ReviewToolFacts["comments"][number];

let nextId = 1;

function fromTool(body: string): Comment {
  nextId += 1;
  return { id: nextId, userLogin: TOOL.login, userType: "Bot", editor: TOOL.login, body, createdAt: "2026-10-26T09:00:00Z" };
}

/** The request `run land` posts: the tool's trigger line, then the marker that times the wait and counts the round. */
function request(head: string, createdAt: string = REQUESTED_AT): Comment {
  nextId += 1;
  return { id: nextId, userLogin: "a-person", userType: "User", editor: null, body: `${TOOL.request}\n${requestMarker(head)}`, createdAt };
}

function facts(head: string, comments: Comment[], over: Partial<ReviewToolFacts> = {}): ReviewToolFacts {
  return { head, now: REQUESTED_MS + 5 * MINUTE, comments, reviews: [], reactions: [], ...over };
}

/** A block in the real shape with the given `code_review` members, for the shapes no real pull request is holding. */
function block(head: string, status: string, anyFindings: boolean, unresolved: boolean): string {
  return `<!-- codex-review-state:v1 {"code_review":{"commit_sha":"${head}","has_any_findings":${anyFindings},"has_unresolved_findings":${unresolved},"status":"${status}"},"security_review":${NULL_SECTION}} -->`;
}

function state(input: ReviewToolFacts, tool: ReviewToolConfig = TOOL): ReviewToolState {
  return reviewToolVerdict(input, tool).state;
}

/** A section as the tool fills it, on `head`, with no findings unless the members say so. */
function filled(head: string | null, status: string | null = "completed", anyFindings: boolean | null = false, unresolved: boolean | null = false): string {
  return JSON.stringify({ commit_sha: head, has_any_findings: anyFindings, has_unresolved_findings: unresolved, status });
}

/** A block whose `code_review` is clean on {@link CLEAN_HEAD}, with `security` as the section beside it. */
function beside(security: string): string {
  return `<!-- codex-review-state:v1 {"code_review":${filled(CLEAN_HEAD)},"security_review":${security}} -->`;
}

const WAIT_ENDED = REQUESTED_MS + 41 * MINUTE;

describe("requestMarker", () => {
  it("is the hidden line a request carries", () => {
    expect(requestMarker(CLEAN_HEAD)).toBe(`<!-- stamity:review-request ${CLEAN_HEAD} -->`);
  });
});

describe("parseStateBlock", () => {
  it("reads the clean pass Codex left on #129", () => {
    expect(parseStateBlock(CLEAN_BODY, "codex-review-state:v1", "code_review")).toEqual({
      commitSha: CLEAN_HEAD,
      status: "completed",
      hasFindings: false,
      hasUnresolved: false,
    });
  });

  it("reads the findings Codex left on #124", () => {
    expect(parseStateBlock(FINDINGS_BODY, "codex-review-state:v1", "code_review")).toEqual({
      commitSha: FINDINGS_HEAD,
      status: "completed",
      hasFindings: true,
      hasUnresolved: true,
    });
  });

  it("reads no block where the marker is another version, or only a longer name", () => {
    expect(parseStateBlock(CLEAN_BODY, "codex-review-state:v2", "code_review")).toBeNull();
    expect(parseStateBlock(CLEAN_BODY, "codex-review-state:v", "code_review")).toBeNull();
    expect(parseStateBlock("a plain comment", "codex-review-state:v1", "code_review")).toBeNull();
  });

  it("reads no block from text that is not whole, not JSON, or not an object", () => {
    expect(parseStateBlock(`<!-- codex-review-state:v1 {"code_review":{}}`, "codex-review-state:v1", "code_review")).toBeNull();
    expect(parseStateBlock(`<!-- codex-review-state:v1 {"code_review": -->`, "codex-review-state:v1", "code_review")).toBeNull();
    expect(parseStateBlock(`<!-- codex-review-state:v1 [1] -->`, "codex-review-state:v1", "code_review")).toBeNull();
  });

  it("reads no block from a section left null, whichever way it was left", () => {
    expect(parseStateBlock(CLEAN_BODY, "codex-review-state:v1", "security_review")).toBeNull();
    expect(parseStateBlock(`<!-- codex-review-state:v1 {"code_review":null} -->`, "codex-review-state:v1", "code_review")).toBeNull();
    expect(parseStateBlock(CLEAN_BODY, "codex-review-state:v1", "absent_review")).toBeNull();
  });

  it.each([
    ["a short sha", `{"commit_sha":"1e9ab6a","has_any_findings":false,"has_unresolved_findings":false,"status":"completed"}`],
    ["a null flag", `{"commit_sha":"${CLEAN_HEAD}","has_any_findings":null,"has_unresolved_findings":false,"status":"completed"}`],
    ["a text flag", `{"commit_sha":"${CLEAN_HEAD}","has_any_findings":false,"has_unresolved_findings":"false","status":"completed"}`],
    ["no status", `{"commit_sha":"${CLEAN_HEAD}","has_any_findings":false,"has_unresolved_findings":false}`],
  ])("reads no block from %s, so the absent member never reads as false", (_name, section) => {
    expect(parseStateBlock(`<!-- codex-review-state:v1 {"code_review":${section}} -->`, "codex-review-state:v1", "code_review")).toBeNull();
  });

  /*
   * TEST CHANGE, justified (review/16, REQ-FLOW-154): the case this replaces pinned a filled section on an older commit as
   * ignored, so an open security finding there read clean. The criterion moved by the orchestrator's sign-off: any section
   * not left null must be completed, on the same commit, with no findings. Only a section left null is ignored.
   */
  it("counts a filled section beside the one read: on the same commit it adds what it holds", () => {
    const read = (security: string) => parseStateBlock(beside(security), "codex-review-state:v1", "code_review");
    expect(read(filled(CLEAN_HEAD, "completed", true, false))).toMatchObject({ status: "completed", hasFindings: true, hasUnresolved: false });
    expect(read(filled(CLEAN_HEAD, "running", null, null))).toMatchObject({ status: "running" });
  });

  it.each([
    ["an older commit holding findings", filled(OTHER_HEAD, "completed", true, true)],
    ["an older commit holding none", filled(OTHER_HEAD)],
    ["no commit, with its flags filled", filled(null, "completed", false, false)],
    ["a short sha", filled(CLEAN_HEAD.slice(0, 7))],
    ["a run on another commit", filled(OTHER_HEAD, "running", null, null)],
    ["an empty object", "{}"],
    ["text in place of a section", `"unknown"`],
  ])("never reads a block as completed beside %s", (_name, security) => {
    expect(parseStateBlock(beside(security), "codex-review-state:v1", "code_review")?.status).not.toBe("completed");
  });

  it.each([
    ["JSON null", "null"],
    ["every member null", NULL_SECTION],
  ])("ignores a section beside the one read that was left null as %s", (_name, security) => {
    expect(parseStateBlock(beside(security), "codex-review-state:v1", "code_review")).toEqual({
      commitSha: CLEAN_HEAD,
      status: "completed",
      hasFindings: false,
      hasUnresolved: false,
    });
  });

  it("reads no block where the marker occurs more than once, whichever block comes first", () => {
    const forged = block(CLEAN_HEAD, "completed", false, false);
    const real = block(OTHER_HEAD, "completed", true, true);
    expect(parseStateBlock(`${forged}\n${real}`, "codex-review-state:v1", "code_review")).toBeNull();
    expect(parseStateBlock(`${real}\n${forged}`, "codex-review-state:v1", "code_review")).toBeNull();
    expect(parseStateBlock(`${forged}\n${forged}`, "codex-review-state:v1", "code_review")).toBeNull();
  });

  it("counts the marker in plain text too, so a block beside a mention of it reads as no block", () => {
    expect(parseStateBlock(`${CLEAN_BODY}\n\nThe tool writes codex-review-state:v1 here.`, "codex-review-state:v1", "code_review")).toBeNull();
  });
});

describe("reviewToolVerdict, state comment", () => {
  it("reads a clean block on the head as clean, and carries the head", () => {
    const verdict = reviewToolVerdict(facts(CLEAN_HEAD, [request(CLEAN_HEAD), fromTool(CLEAN_BODY)]), TOOL);
    expect(verdict).toMatchObject({ state: "clean", head: CLEAN_HEAD });
    expect(verdict.reason).toContain(TOOL.login);
  });

  it("reads a clean block with no request as clean: the tool also runs when a pull request opens", () => {
    expect(state(facts(CLEAN_HEAD, [fromTool(CLEAN_BODY)]))).toBe("clean");
  });

  it("reads a clean block on another sha as waiting", () => {
    expect(state(facts(OTHER_HEAD, [request(OTHER_HEAD), fromTool(CLEAN_BODY)]))).toBe("waiting");
  });

  it.each([
    ["both flags true", true, true],
    ["only the unresolved flag", false, true],
    ["only the any-findings flag, as after every thread is resolved", true, false],
  ])("reads a completed block with %s as findings", (_name, anyFindings, unresolved) => {
    const body = block(CLEAN_HEAD, "completed", anyFindings, unresolved);
    expect(state(facts(CLEAN_HEAD, [request(CLEAN_HEAD), fromTool(body)]))).toBe("findings");
  });

  it("reads the real findings pass as findings, and a new run on a new head clears it", () => {
    const comments = [request(FINDINGS_HEAD), fromTool(FINDINGS_BODY)];
    expect(state(facts(FINDINGS_HEAD, comments))).toBe("findings");
    const rerun = [request(FINDINGS_HEAD), request(CLEAN_HEAD), fromTool(CLEAN_BODY)];
    expect(state(facts(CLEAN_HEAD, rerun))).toBe("clean");
  });

  it("holds findings when one of two blocks on the head reports them, whichever came first", () => {
    const found = fromTool(block(CLEAN_HEAD, "completed", true, false));
    expect(state(facts(CLEAN_HEAD, [request(CLEAN_HEAD), fromTool(CLEAN_BODY), found]))).toBe("findings");
    expect(state(facts(CLEAN_HEAD, [request(CLEAN_HEAD), found, fromTool(CLEAN_BODY)]))).toBe("findings");
  });

  it("reads a clean block beside a running one on the head as waiting", () => {
    const running = fromTool(block(CLEAN_HEAD, "running", false, false));
    expect(state(facts(CLEAN_HEAD, [request(CLEAN_HEAD), fromTool(CLEAN_BODY), running]))).toBe("waiting");
  });

  it("gives a run with stale true flags its wait: only a completed run reports findings", () => {
    const running = fromTool(block(CLEAN_HEAD, "running", true, true));
    expect(state(facts(CLEAN_HEAD, [request(CLEAN_HEAD), running]))).toBe("waiting");
  });

  it("reads running as waiting up to the wait's end and silent from it, timed from the request", () => {
    const comments = [request(CLEAN_HEAD), fromTool(block(CLEAN_HEAD, "running", false, false))];
    expect(state(facts(CLEAN_HEAD, comments, { now: REQUESTED_MS + 40 * MINUTE - 1 }))).toBe("waiting");
    const verdict = reviewToolVerdict(facts(CLEAN_HEAD, comments, { now: REQUESTED_MS + 40 * MINUTE }), TOOL);
    expect(verdict.state).toBe("silent");
    expect(verdict.reason).toContain("40 minutes");
  });

  it("reads a block that never appears as waiting, then silent", () => {
    const comments = [request(CLEAN_HEAD)];
    expect(state(facts(CLEAN_HEAD, comments))).toBe("waiting");
    expect(state(facts(CLEAN_HEAD, comments, { now: REQUESTED_MS + 41 * MINUTE }))).toBe("silent");
  });

  it("times the wait from the head's first request, so a repeated request never extends it", () => {
    const later = new Date(REQUESTED_MS + 39 * MINUTE).toISOString();
    const comments = [request(CLEAN_HEAD), request(CLEAN_HEAD, later)];
    expect(state(facts(CLEAN_HEAD, comments, { now: REQUESTED_MS + 41 * MINUTE }))).toBe("silent");
    const reversed = [request(CLEAN_HEAD, later), request(CLEAN_HEAD)];
    expect(state(facts(CLEAN_HEAD, reversed, { now: REQUESTED_MS + 41 * MINUTE }))).toBe("silent");
  });

  it("does not time the wait from another head's request", () => {
    expect(state(facts(CLEAN_HEAD, [request(OTHER_HEAD)], { now: REQUESTED_MS + 500 * MINUTE }))).toBe("waiting");
  });

  it("says when nothing asked the tool about this head", () => {
    expect(reviewToolVerdict(facts(CLEAN_HEAD, []), TOOL)).toMatchObject({ state: "waiting", reason: expect.stringContaining("no request") });
  });

  it("gives the same text from a person, or a bot of another name, nothing", () => {
    const pasted: Comment = { ...fromTool(CLEAN_BODY), userLogin: TOOL.login, userType: "User" };
    const otherBot: Comment = { ...fromTool(CLEAN_BODY), userLogin: "another-tool[bot]" };
    expect(state(facts(CLEAN_HEAD, [request(CLEAN_HEAD), pasted]))).toBe("waiting");
    expect(state(facts(CLEAN_HEAD, [request(CLEAN_HEAD), otherBot]))).toBe("waiting");
  });

  it("reads a clean state comment as clean beside another bot comment holding the marker twice", () => {
    const echo = fromTool(`${block(CLEAN_HEAD, "completed", true, true)}\n${block(CLEAN_HEAD, "completed", true, true)}`);
    expect(state(facts(CLEAN_HEAD, [request(CLEAN_HEAD), fromTool(CLEAN_BODY), echo]))).toBe("clean");
  });

  it("reads a malformed block as waiting, then silent", () => {
    const comments = [request(CLEAN_HEAD), fromTool(`<!-- codex-review-state:v1 {"code_review": -->`)];
    expect(state(facts(CLEAN_HEAD, comments))).toBe("waiting");
    expect(state(facts(CLEAN_HEAD, comments, { now: REQUESTED_MS + 41 * MINUTE }))).toBe("silent");
  });

  it("never reads an unknown status or version as clean", () => {
    const failed = [request(CLEAN_HEAD), fromTool(block(CLEAN_HEAD, "failed", false, false))];
    expect(state(facts(CLEAN_HEAD, failed))).toBe("waiting");
    expect(state(facts(CLEAN_HEAD, failed, { now: REQUESTED_MS + 41 * MINUTE }))).toBe("silent");
    const version = [request(CLEAN_HEAD), fromTool(CLEAN_BODY.replace("review-state:v1", "review-state:v2"))];
    expect(state(facts(CLEAN_HEAD, version))).toBe("waiting");
  });

  it("holds on a filled section beside the one configured: findings on the head are findings", () => {
    const body = CLEAN_BODY.replace(NULL_SECTION, `{"commit_sha":"${CLEAN_HEAD}","has_any_findings":true,"has_unresolved_findings":true,"status":"completed"}`);
    expect(state(facts(CLEAN_HEAD, [request(CLEAN_HEAD), fromTool(body)]))).toBe("findings");
  });

  it("holds on open findings in a filled section on another commit, and names the section", () => {
    const comments = [request(CLEAN_HEAD), fromTool(beside(filled(OTHER_HEAD, "completed", true, true)))];
    expect(state(facts(CLEAN_HEAD, comments))).toBe("waiting");
    const verdict = reviewToolVerdict(facts(CLEAN_HEAD, comments, { now: WAIT_ENDED }), TOOL);
    expect(verdict.state).toBe("silent");
    expect(verdict.reason).toContain("security_review");
  });

  it("ends in rounds spent, a person's call, where a filled section never comes back to the head", () => {
    const comments = [request(OTHER_HEAD), request(CLEAN_HEAD), fromTool(beside(filled(OTHER_HEAD)))];
    expect(state(facts(CLEAN_HEAD, comments, { now: WAIT_ENDED }))).toBe("spent");
  });

  it("never reads clean with the marker or the section unset, and says so", () => {
    const { stateMarker: _marker, ...noMarker } = TOOL;
    const { stateSection: _section, ...noSection } = TOOL;
    const input = facts(CLEAN_HEAD, [request(CLEAN_HEAD), fromTool(CLEAN_BODY)]);
    expect(reviewToolVerdict(input, noMarker)).toMatchObject({ state: "waiting", reason: expect.stringContaining("stateMarker") });
    expect(state(input, noSection)).toBe("waiting");
    expect(state({ ...input, now: REQUESTED_MS + 41 * MINUTE }, noMarker)).toBe("silent");
  });
});

describe("reviewToolVerdict, the state comment's last editor", () => {
  const edited = (editor: string | null): Comment => ({ ...fromTool(CLEAN_BODY), editor });

  it("trusts a block never edited, or last edited by the tool", () => {
    expect(state(facts(CLEAN_HEAD, [request(CLEAN_HEAD), edited(null)]))).toBe("clean");
    expect(state(facts(CLEAN_HEAD, [request(CLEAN_HEAD), edited(TOOL.login)]))).toBe("clean");
  });

  it("gives a block last edited by anyone else nothing, and names who", () => {
    const comments = [request(CLEAN_HEAD), edited("a-person")];
    expect(state(facts(CLEAN_HEAD, comments))).toBe("waiting");
    const verdict = reviewToolVerdict(facts(CLEAN_HEAD, comments, { now: WAIT_ENDED }), TOOL);
    expect(verdict.state).toBe("silent");
    expect(verdict.reason).toContain("a-person");
    expect(verdict.reason).not.toContain("gave no result");
  });

  it.each([
    ["the placeholder for an editor that could not be read", "unknown"],
    ["the tool's name in GraphQL's bare form, which a person's account could hold", "chatgpt-codex-connector"],
    ["a value the caller never filled", undefined as unknown as null],
  ])("does not trust %s", (_name, editor) => {
    expect(state(facts(CLEAN_HEAD, [request(CLEAN_HEAD), edited(editor)]))).toBe("waiting");
  });

  it("gives findings from an edited block nothing either, since only the tool's own word counts", () => {
    const comment: Comment = { ...fromTool(FINDINGS_BODY), editor: "a-person" };
    expect(state(facts(FINDINGS_HEAD, [request(FINDINGS_HEAD), comment]))).toBe("waiting");
  });

  it("says nothing about an edit to a comment holding no block", () => {
    const comment: Comment = { ...fromTool("a plain comment"), editor: "a-person" };
    const verdict = reviewToolVerdict(facts(CLEAN_HEAD, [request(CLEAN_HEAD), comment], { now: WAIT_ENDED }), TOOL);
    expect(verdict.reason).toContain("gave no result");
  });
});

describe("reviewToolVerdict, a block the reader cannot use", () => {
  const SHAPELESS = `{"commit_sha":"${CLEAN_HEAD}","has_any_findings":false,"has_unresolved_findings":false}`;

  it.each([
    ["a failed status", block(CLEAN_HEAD, "failed", false, false), "failed"],
    ["a new version", CLEAN_BODY.replace("review-state:v1", "review-state:v2"), "codex-review-state:v2"],
    ["a block that does not parse", `<!-- codex-review-state:v1 {"code_review": -->`, "does not parse"],
    ["a block that never closes", `<!-- codex-review-state:v1 {"code_review":{}}`, "does not parse"],
    ["a section missing a member", `<!-- codex-review-state:v1 {"code_review":${SHAPELESS}} -->`, "code_review"],
    ["a section that is not an object", `<!-- codex-review-state:v1 {"code_review":"done"} -->`, "code_review"],
    ["no configured section at all", `<!-- codex-review-state:v1 {"other_review":${filled(CLEAN_HEAD)}} -->`, "code_review"],
    ["the marker twice", `${block(CLEAN_HEAD, "completed", false, false)}\n${block(CLEAN_HEAD, "completed", false, false)}`, "more than once"],
  ])("names %s when the wait ends, says it is no silence, and does not pass", (_name, body, named) => {
    const comments = [request(CLEAN_HEAD), fromTool(body)];
    expect(state(facts(CLEAN_HEAD, comments))).toBe("waiting");
    const verdict = reviewToolVerdict(facts(CLEAN_HEAD, comments, { now: WAIT_ENDED }), TOOL);
    expect(verdict.state).toBe("silent");
    expect(verdict.reason).toContain(named);
    expect(verdict.reason).not.toContain("gave no result");
  });

  const failed = () => fromTool(block(CLEAN_HEAD, "failed", false, false));

  it("names it on every line that holds: during the wait, with no request, and with the rounds spent", () => {
    const during = reviewToolVerdict(facts(CLEAN_HEAD, [request(CLEAN_HEAD), failed()]), TOOL);
    expect(during).toMatchObject({ state: "waiting", reason: expect.stringContaining("failed") });
    const unasked = reviewToolVerdict(facts(CLEAN_HEAD, [failed()]), TOOL);
    expect(unasked).toMatchObject({ state: "waiting", reason: expect.stringContaining("failed") });
    expect(unasked.reason).not.toContain("no result from");
    const spent = reviewToolVerdict(facts(CLEAN_HEAD, [request(OTHER_HEAD), request(FINDINGS_HEAD), failed()]), TOOL);
    expect(spent).toMatchObject({ state: "spent", reason: expect.stringContaining("failed") });
  });

  it("keeps the plain line for a run still going, a stale block, and no block", () => {
    const reason = (comments: Comment[]) => reviewToolVerdict(facts(CLEAN_HEAD, [request(CLEAN_HEAD), ...comments], { now: WAIT_ENDED }), TOOL).reason;
    expect(reason([fromTool(block(CLEAN_HEAD, "running", false, false))])).toContain("gave no result");
    expect(reason([fromTool(block(OTHER_HEAD, "failed", false, false))])).toContain("gave no result");
    expect(reason([fromTool(FINDINGS_BODY)])).toContain("gave no result");
    expect(reason([fromTool("a plain comment")])).toContain("gave no result");
    expect(reason([fromTool(`<!-- codex-review-state:v1 {"code_review":${NULL_SECTION}} -->`)])).toContain("gave no result");
  });

  it("does not take a marker of another name, or one that is not a whole block, for a new version", () => {
    const reason = (body: string, tool: ReviewToolConfig = TOOL) =>
      reviewToolVerdict(facts(CLEAN_HEAD, [request(CLEAN_HEAD), fromTool(body)], { now: WAIT_ENDED }), tool).reason;
    expect(reason("<!-- codex-review-state:v2-->")).toContain("gave no result");
    expect(reason("<!-- codex-review-state:vnext {} -->")).toContain("gave no result");
    expect(reason("<!-- other-state:v1 {} -->", { ...TOOL, stateMarker: "plain-state" })).toContain("gave no result");
  });

  it("shows a status or a section name only where it is plain text, so a block cannot write a person's line", () => {
    const hostile = JSON.stringify("one line\n\u001b[2Jnext");
    const odd = reviewToolVerdict(facts(CLEAN_HEAD, [request(CLEAN_HEAD), fromTool(block(CLEAN_HEAD, hostile.slice(1, -1), false, false))]), TOOL);
    expect(odd.state).toBe("waiting");
    expect(odd.reason).toContain("an unreadable value");
    expect(odd.reason).not.toContain("one line");
    const body = `<!-- codex-review-state:v1 {"code_review":${filled(CLEAN_HEAD)},${hostile}:${filled(OTHER_HEAD)}} -->`;
    const off = reviewToolVerdict(facts(CLEAN_HEAD, [request(CLEAN_HEAD), fromTool(body)]), TOOL);
    expect(off.state).toBe("waiting");
    expect(off.reason).toContain("an unreadable value");
    expect(off.reason).not.toContain("one line");
  });

  it("shows a last editor only where it is plain text", () => {
    const comment: Comment = { ...fromTool(CLEAN_BODY), editor: "a person\nnext" };
    const verdict = reviewToolVerdict(facts(CLEAN_HEAD, [request(CLEAN_HEAD), comment]), TOOL);
    expect(verdict.reason).toContain("an unreadable value");
    expect(verdict.reason).not.toContain("a person");
  });
});

describe("reviewToolVerdict, rounds", () => {
  const twoRounds = (): Comment[] => [request(OTHER_HEAD), request(FINDINGS_HEAD)];

  it("gives a new head nothing once the rounds are spent", () => {
    const verdict = reviewToolVerdict(facts(CLEAN_HEAD, twoRounds()), TOOL);
    expect(verdict.state).toBe("spent");
    expect(verdict.reason).toContain("2 of 2");
  });

  it("reads findings on the last round as spent", () => {
    expect(state(facts(FINDINGS_HEAD, [...twoRounds(), fromTool(FINDINGS_BODY)]))).toBe("spent");
  });

  it("reads findings with a round left as findings", () => {
    expect(state(facts(FINDINGS_HEAD, [request(FINDINGS_HEAD), fromTool(FINDINGS_BODY)]))).toBe("findings");
  });

  it("still reads a clean head as clean on the last round", () => {
    expect(state(facts(CLEAN_HEAD, [request(OTHER_HEAD), request(CLEAN_HEAD), fromTool(CLEAN_BODY)]))).toBe("clean");
  });

  it("waits out the last round rather than spending it before the tool has answered", () => {
    const comments = twoRounds();
    expect(state(facts(FINDINGS_HEAD, comments))).toBe("waiting");
    expect(state(facts(FINDINGS_HEAD, comments, { now: REQUESTED_MS + 41 * MINUTE }))).toBe("spent");
    const single: ReviewToolConfig = { ...TOOL, rounds: 1 };
    expect(state(facts(CLEAN_HEAD, [request(CLEAN_HEAD)]), single)).toBe("waiting");
  });

  it("counts distinct heads, so a repeated request on one head is one round", () => {
    const comments = [request(CLEAN_HEAD), request(CLEAN_HEAD), request(CLEAN_HEAD)];
    expect(state(facts(FINDINGS_HEAD, comments))).toBe("waiting");
  });

  it("counts every head named in one comment, and no text that is not a whole marker", () => {
    const both: Comment = { ...request(OTHER_HEAD), body: `${requestMarker(OTHER_HEAD)}\n${requestMarker(FINDINGS_HEAD)}` };
    expect(state(facts(CLEAN_HEAD, [both]))).toBe("spent");
    const partial: Comment = { ...request(OTHER_HEAD), body: "<!-- stamity:review-request 1e9ab6a -->" };
    expect(state(facts(CLEAN_HEAD, [partial, request(OTHER_HEAD)]))).toBe("waiting");
  });
});

describe("reviewToolVerdict, review state", () => {
  const tool: ReviewToolConfig = { ...TOOL, clean: "review-state" };
  const review = (commitId: string, reviewState: string, userLogin: string = TOOL.login) => ({ userLogin, commitId, state: reviewState });

  it("needs APPROVED by the tool on the head", () => {
    const comments = [request(CLEAN_HEAD)];
    expect(state(facts(CLEAN_HEAD, comments, { reviews: [review(CLEAN_HEAD, "APPROVED")] }), tool)).toBe("clean");
    expect(state(facts(CLEAN_HEAD, comments, { reviews: [review(OTHER_HEAD, "APPROVED")] }), tool)).toBe("waiting");
    expect(state(facts(CLEAN_HEAD, comments, { reviews: [review(CLEAN_HEAD, "APPROVED", "a-person")] }), tool)).toBe("waiting");
    expect(state(facts(CLEAN_HEAD, comments, { reviews: [review(CLEAN_HEAD, "COMMENTED")] }), tool)).toBe("waiting");
  });

  it("reads changes requested on the head as findings, even beside an approval", () => {
    const reviews = [review(CLEAN_HEAD, "APPROVED"), review(CLEAN_HEAD, "CHANGES_REQUESTED")];
    expect(state(facts(CLEAN_HEAD, [request(CLEAN_HEAD)], { reviews }), tool)).toBe("findings");
  });

  it("gives a state comment nothing", () => {
    expect(state(facts(CLEAN_HEAD, [request(CLEAN_HEAD), fromTool(CLEAN_BODY)]), tool)).toBe("waiting");
  });
});

describe("reviewToolVerdict, reaction", () => {
  const tool: ReviewToolConfig = { ...TOOL, clean: "reaction" };

  it("needs +1 from the tool, and the reason says it is tied to no commit", () => {
    const verdict = reviewToolVerdict(facts(CLEAN_HEAD, [], { reactions: [{ userLogin: TOOL.login, content: "+1" }] }), tool);
    expect(verdict.state).toBe("clean");
    expect(verdict.reason).toContain("cannot be tied to a commit");
  });

  it("gives another reaction, or the same one from anyone else, nothing", () => {
    const comments = [request(CLEAN_HEAD)];
    expect(state(facts(CLEAN_HEAD, comments, { reactions: [{ userLogin: TOOL.login, content: "eyes" }] }), tool)).toBe("waiting");
    expect(state(facts(CLEAN_HEAD, comments, { reactions: [{ userLogin: "a-person", content: "+1" }] }), tool)).toBe("waiting");
  });
});
