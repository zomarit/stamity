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
  return { id: nextId, userLogin: TOOL.login, userType: "Bot", body, createdAt: "2026-10-26T09:00:00Z" };
}

/** The request `run land` posts: the tool's trigger line, then the marker that times the wait and counts the round. */
function request(head: string, createdAt: string = REQUESTED_AT): Comment {
  nextId += 1;
  return { id: nextId, userLogin: "a-person", userType: "User", body: `${TOOL.request}\n${requestMarker(head)}`, createdAt };
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

  it("counts a filled section beside the one read when it reports on the same commit", () => {
    const clean = `{"commit_sha":"${CLEAN_HEAD}","has_any_findings":false,"has_unresolved_findings":false,"status":"completed"}`;
    const found = `{"commit_sha":"${CLEAN_HEAD}","has_any_findings":true,"has_unresolved_findings":false,"status":"completed"}`;
    const running = `{"commit_sha":"${CLEAN_HEAD}","has_any_findings":null,"has_unresolved_findings":null,"status":"running"}`;
    const older = `{"commit_sha":"${OTHER_HEAD}","has_any_findings":true,"has_unresolved_findings":true,"status":"completed"}`;
    const read = (security: string) =>
      parseStateBlock(`<!-- codex-review-state:v1 {"code_review":${clean},"security_review":${security}} -->`, "codex-review-state:v1", "code_review");
    expect(read(found)).toMatchObject({ status: "completed", hasFindings: true, hasUnresolved: false });
    expect(read(running)).toMatchObject({ status: "running" });
    expect(read(older)).toEqual({ commitSha: CLEAN_HEAD, status: "completed", hasFindings: false, hasUnresolved: false });
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

  it("never reads clean with the marker or the section unset, and says so", () => {
    const { stateMarker: _marker, ...noMarker } = TOOL;
    const { stateSection: _section, ...noSection } = TOOL;
    const input = facts(CLEAN_HEAD, [request(CLEAN_HEAD), fromTool(CLEAN_BODY)]);
    expect(reviewToolVerdict(input, noMarker)).toMatchObject({ state: "waiting", reason: expect.stringContaining("stateMarker") });
    expect(state(input, noSection)).toBe("waiting");
    expect(state({ ...input, now: REQUESTED_MS + 41 * MINUTE }, noMarker)).toBe("silent");
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
