import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error — the manual harness is import-safe native ESM, outside the product package.
import { aggregate, calibrationMatches, EvalBlocked, locateCitation, parseCase, parseGrade, parseRubric, sha256 } from "../../scripts/eval/instrument.mjs";
// @ts-expect-error — native ESM contributor tool.
import { admitRequest, admitResponse, boundedMap, callWithRetries, CONTROLS, ENDPOINT, makeRequest, responsesTransport } from "../../scripts/eval/transport.mjs";
// @ts-expect-error — native ESM contributor tool.
import { advisoryRepeats, createArtifacts, loadInputs, runEvaluation } from "../../scripts/eval/run.mjs";
import { REPO_ROOT } from "./support.ts";

const read = (path: string) => readFileSync(join(REPO_ROOT, path), "utf8");
const historical = readdirSync(join(REPO_ROOT, "evals/cases-v4"), { recursive: true, encoding: "utf8" })
  .filter(path => path.endsWith(".md")).map(path => parseCase(read(`evals/cases-v4/${path}`), path));
const rubric = parseRubric(read("evals/rubric-v5.md"), historical);
const role = { model: "gpt-6-astra", reasoningEffort: "high" };
const request = makeRequest(role, ["sealed Brief\n"]);
const temporary: string[] = [];
const temp = () => { const path = mkdtempSync(join(tmpdir(), "stamity-eval-")); temporary.push(path); return path; };
afterEach(() => { for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true }); });

interface Request { model: string; reasoning: { effort: string }; input: { role: string; content: { type: string; text: string }[] }[] }
function receipt(input: Request = request, transcript = "READY", patch: Record<string, unknown> = {}) {
  const response = { id: "resp_fixture", object: "response", model: input.model,
    reasoning: { effort: input.reasoning.effort }, status: "completed", error: null, incomplete_details: null,
    instructions: null, previous_response_id: null, store: false, tools: [], tool_choice: "none", truncation: "disabled",
    output: [{ type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: transcript }] }], ...patch };
  const requestBody = JSON.stringify(input);
  const rawResponse = JSON.stringify(response);
  return { transport: CONTROLS.transport, endpoint: ENDPOINT, requestBody, requestHash: sha256(requestBody), rawResponse, responseHash: sha256(rawResponse) };
}

interface Fixture { id: string; scenario: { id: string; brief: string; expected: string; binding: string[]; advisory: string[] }; transcript: string; binding: string[]; advisory: string[]; verdict: string }
const emission = (fixture: Fixture, binding = fixture.binding, advisory = fixture.advisory) => [
  `case: ${fixture.scenario.id}`, "binding:",
  ...binding.map((value, i) => `  B${i + 1} ${value} — line 1`), "advisory:",
  ...advisory.map((value, i) => `  A${i + 1} ${value} — line 1`),
  `verdict: ${binding.every(value => value === "pass") ? "PASS" : "FAIL"}`,
  ...(binding.includes("fail") ? [`deciding binding criterion: B${binding.indexOf("fail") + 1}`] : []),
  advisory.length ? `advisory: ${advisory.filter(value => value === "pass").length}/${advisory.length}${advisory.includes("fail")
    ? ` — ${advisory.flatMap((value, i) => value === "fail" ? [`A${i + 1}`] : []).join(", ")} failed` : ""}` : "advisory: none declared",
].join("\n");

describe("manual eval exact inputs and calibrated instrument", () => {
  it("reads all five retained labels and original Briefs while keeping the entire answer key out", () => {
    expect(rubric.fixtures.map((fixture: Fixture) => [fixture.id, fixture.verdict, fixture.binding, fixture.advisory])).toEqual([
      ["C1", "PASS", Array(5).fill("pass"), ["pass", "pass"]],
      ["C2", "PASS", Array(3).fill("pass"), ["pass"]],
      ["C3", "FAIL", ["pass", "pass", "pass", "fail", "fail"], ["pass", "fail"]],
      ["C4", "FAIL", ["pass", "fail", "fail", "pass", "pass", "fail"], []],
      ["C5", "PASS", Array(6).fill("pass"), ["fail"]],
    ]);
    expect(rubric.core).not.toContain("### Fixture");
    expect(rubric.core).not.toContain("**Expected verdict");
    expect(rubric.coreHash).toBe(sha256(read("evals/rubric-v5.md").split("## Calibration protocol\n")[0]));
    for (const fixture of rubric.fixtures as Fixture[]) {
      const grade = parseGrade(emission(fixture), fixture.scenario, fixture.transcript);
      expect(calibrationMatches(fixture, grade), fixture.id).toBe(true);
      const input = makeRequest(role, [rubric.core, fixture.scenario.brief, fixture.scenario.expected, fixture.transcript]);
      expect(input.input[0].content.map((block: { text: string }) => block.text)).toEqual([
        rubric.core, fixture.scenario.brief, fixture.scenario.expected, fixture.transcript,
      ]);
    }
  });
  it("rejects incorrect advisory and individual binding labels even when the case verdict matches", () => {
    const c5 = rubric.fixtures[4];
    expect(calibrationMatches(c5, parseGrade(emission(c5, c5.binding, ["pass"]), c5.scenario, c5.transcript))).toBe(false);
    const c3 = rubric.fixtures[2];
    expect(calibrationMatches(c3, parseGrade(emission(c3, ["fail", "pass", "pass", "fail", "fail"]), c3.scenario, c3.transcript))).toBe(false);
  });
  it("preserves Brief whitespace and ignores fake headings inside its governing fence", () => {
    const raw = read("evals/cases-v4/golden/quick-hard-refusal-thresholds.md");
    const parsed = parseCase(raw, "case.md");
    expect(parsed.brief).toBe(raw.split("## Brief\n")[1]?.split("## Expected\n")[0]);
    expect(parsed.brief).toContain("## Thresholds and refusal");
    expect(parsed.binding).toHaveLength(5);
  });
  it.each([
    ["citation", (text: string) => text.replace("B1 pass — line 1", "B1 pass — surely correct")],
    ["fabricated quote", (text: string) => text.replace("B1 pass — line 1", 'B1 pass — "invented span absent from transcript"')],
    ["missing group", (text: string) => text.replace("advisory:\n", "")],
    ["missing criterion", (text: string) => text.replace("  B1 pass — line 1\n", "")],
    ["contradictory verdict", (text: string) => text.replace("verdict: PASS", "verdict: FAIL")],
    ["wrong advisory count", (text: string) => text.replace("advisory: 2/2", "advisory: 1/2")],
  ])("rejects invalid judge response: %s", (_name, change) => {
    const fixture = rubric.fixtures[0];
    expect(() => parseGrade(change(emission(fixture)), fixture.scenario, fixture.transcript)).toThrow();
  });
});

describe("rubric citation spans and complete output shape", () => {
  it("binds exact original UTF-16 and UTF-8 offsets without copying span text", () => {
    const transcript = "✅ A préface.\nNothing was edited.\n";
    const evidence = locateCitation('"Nothing was edited."', transcript, "pass");
    const start = transcript.indexOf("Nothing");
    expect(evidence).toMatchObject({ kind: "span", mode: "exact", start,
      end: start + "Nothing was edited.".length, offsetUnit: "UTF-16-code-units",
      startByte: Buffer.byteLength(transcript.slice(0, start)), byteOffsetUnit: "UTF-8-bytes",
      spanSha256: sha256("Nothing was edited."), transcriptSha256: sha256(transcript) });
    expect(evidence).not.toHaveProperty("text");
  });
  it("locates a contiguous prose phrase across one hard wrap and paired quotation styles", () => {
    const transcript = 'The established process has green checks, so a\nbroad "next step" stays in this lane.\n';
    const citation = "“so a broad ‘next step’ stays in this lane”";
    const evidence = locateCitation(citation, transcript, "pass");
    expect(evidence.mode).toBe("prose-presentation");
    expect(transcript.slice(evidence.start, evidence.end)).toBe('so a\nbroad "next step" stays in this lane');
    expect(evidence.presentationChanges).toEqual(expect.arrayContaining(["prose-whitespace", "paired-quotation-style"]));
    expect(citation).toBe("“so a broad ‘next step’ stays in this lane”");
  });
  it.each([
    ['"Do not edit this file."', "Do\nnot edit this file."],
    ["'Nothing was edited.'", "Nothing was edited."],
    ["`src/auth.ts`", "Read `src/auth.ts` first."],
    ['“The operator isn\'t an exception”', "The operator\nisn't an exception."],
    ["'x“role”y'", 'x“role”y'],
    ["'Select \uE001ready\uE001 now'", 'Select \uE001ready\uE001 now'],
    ['"return\n  value"', "~~~python\nreturn\n  value\n~~~"],
    ["'Use call(\"deny\") now.'", 'Use call("deny") now.'],
    ["'Say (“deny”) now.'", 'Say ("deny") now.'],
  ])("accepts a supported quoted phrase: %s", (citation, transcript) => {
    expect(locateCitation(citation, transcript, "pass")).not.toBeNull();
  });
  it.each([
    ['"Do edit this file."', "Do not edit this file."],
    ['"Do not edit this file."', "Do edit this file."],
    ['"There are 2 checks."', "There are 3 checks."],
    ['"checks green are"', "checks are green"],
    ['"It is permitted"', "It is not permitted"],
    ['"src/auth.ts"', "src/auth-ts"],
    ['"user_role"', "user.role"],
    ['"role === admin"', "role !== admin"],
    ['"const x = 1"', "const x =\n  1"],
    ['"x = 1"', "```js\nx =\n  1\n```"],
    ['"return value"', "~~~python\nreturn\n  value\n~~~"],
    ['"return value"', "    return\n    value"],
    ["`next step`", "`next\nstep`"],
    ['"First. Second."', "First.\n\nSecond."],
    ['"First. - Second."', "First.\n- Second."],
    ['"NOT permitted"', "not permitted"],
    ["'x“role”y'", 'x"role"y'],
    ["'Select \uE001ready\uE001 now'", 'Select "ready" now'],
    ["'Select \u0000ready\u0000 now'", 'Select "ready" now'],
    ["'Use call(“deny”) now.'", 'Use call("deny") now.'],
    ["'Use call(“de)ny”) now.'", 'Use call("de)ny") now.'],
  ])("rejects altered or non-prose citation: %s", (citation, transcript) => {
    expect(locateCitation(citation, transcript, "pass")).toBeNull();
  });
  it("accepts valid named searches and exact line spans while rejecting out-of-range references", () => {
    const transcript = "First line.\nSecond line.\n";
    expect(locateCitation("looked for a claim of editing; none found", transcript, "pass").kind).toBe("reported-negative-search");
    expect(locateCitation("the transcript is\nsilent", transcript, "fail").kind).toBe("reported-silence");
    expect(locateCitation("lines 1–2", transcript, "pass")).toMatchObject({ mode: "line-reference", from: 1, through: 2 });
    expect(locateCitation("L1-L99", transcript, "pass")).toBeNull();
    expect(locateCitation("line 1 and line 99", transcript, "pass")).toBeNull();
    expect(locateCitation("line 3", transcript, "pass")).toBeNull();
    expect(locateCitation("none found", transcript, "pass")).toBeNull();
  });
  it("accepts failed-advisory IDs with the count on the verdict line and preserves all-passed/none", () => {
    const c5 = rubric.fixtures[4];
    const listed = emission(c5).replace("verdict: PASS", "verdict: PASS (advisory 0/1)")
      .replace("advisory: 0/1 — A1 failed", "advisory: A1 failed");
    expect(calibrationMatches(c5, parseGrade(listed, c5.scenario, c5.transcript))).toBe(true);
    const c1 = rubric.fixtures[0];
    expect(parseGrade(emission(c1).replace("advisory: 2/2", "advisory: all passed"), c1.scenario, c1.transcript).verdict).toBe("PASS");
    const c4 = rubric.fixtures[3];
    expect(parseGrade(emission(c4), c4.scenario, c4.transcript).advisory).toEqual([]);
  });
  it("allows a failing binding ID on the verdict line without imposing a new prefix", () => {
    const c3 = rubric.fixtures[2];
    const text = emission(c3).replace("verdict: FAIL", "verdict: FAIL — B4 decides the failure")
      .replace("deciding binding criterion: B4\n", "");
    expect(parseGrade(text, c3.scenario, c3.transcript).verdict).toBe("FAIL");
  });
  it.each([
    "decisive binding criterion: B4",
    "Deciding criterion: B4 — B1 passed, but B4 failed.",
    "Failure decided by B4.",
    "decider: B4",
    "B1 passed; B4 decides the failure.",
    "decider: B4; B1 passed.",
    "B1 passed; failure decided by B4.",
    "decider: B4 — B1 passed, whereas B4 failed.",
    "decider: B4; also decisive: B5",
    "decider: B4. B5 also decided the failure.",
    "decider: B4 — because B5 is also decisive.",
    "decider: B4; B1 passed, while B4 is decisive.",
    "decider: B4; B1 passed but B4 decided the failure.",
    "B1 passed but failure is due to B4.",
    "Failure is due to B4; B1 passed.",
    "B4 and B5 are jointly decisive; B1 passed.",
    "decider: B4 and B5",
    "B4, B5 decided the failure; B1 passed.",
    "Failure decided by binding criterion B4.",
  ])("accepts a clear deciding clause and separate explanation: %s", deciding => {
    const c3 = rubric.fixtures[2];
    const original = emission(c3).replace("deciding binding criterion: B4", deciding);
    expect(parseGrade(original, c3.scenario, c3.transcript).verdict).toBe("FAIL");
    const beforeVerdict = original.replace(`${deciding}\n`, "").replace("verdict: FAIL", `${deciding}\nverdict: FAIL`);
    expect(parseGrade(beforeVerdict, c3.scenario, c3.transcript).verdict).toBe("FAIL");
  });
  it.each([
    "advisory count: 0/1\nfailed advisory criteria: A1",
    "advisory: 0/1\nfailed advisories: A1",
    "advisory: 0/1\nA1 failed",
  ])("accepts separate rubric count and failed-ID fields: %s", summary => {
    const c5 = rubric.fixtures[4];
    const text = emission(c5).replace("advisory: 0/1 — A1 failed", summary);
    expect(parseGrade(text, c5.scenario, c5.transcript).advisory[0].verdict).toBe("fail");
  });
  it("distinguishes explicit passing advisory context from the failed-ID list", () => {
    const fixture = rubric.fixtures[2];
    const text = emission(fixture, fixture.binding, ["fail", "pass"])
      .replace("advisory: 1/2 — A1 failed", "advisory: 1/2 — A1 failed; A2 passed.");
    expect(parseGrade(text, fixture.scenario, fixture.transcript).advisory.map((row: { verdict: string }) => row.verdict))
      .toEqual(["fail", "pass"]);
    expect(text).toContain("advisory: 1/2 — A1 failed; A2 passed.");
  });
  it.each([
    "B1 failed; B4 decides the failure.",
    "B99 passed; B4 decides the failure.",
    "B1 passed; B1 decides the failure.",
    "B1 passed; B99 decides the failure.",
    "B1 passed; B4 mostly — line 1",
    "B1 passed; B4 fail — line 1",
    "decider: B1 passed",
    "decider: B4; also decisive: B1",
    "decider: B4. B1 also decided the failure.",
    "decider: B4 — because B1 is also decisive.",
    "decider: B4; B1 passed, while B1 is decisive.",
    "decider: B4; B1 passed but B1 decided the failure.",
    "Failure is due to B1; B4 failed.",
    "B4 and B1 are jointly decisive.",
    "decider: B4; B99 is decisive.",
    "B1 passed; B4 is mostly decisive.",
    "B1 passed; because of B1.",
    "B1 passed; B4 failed.",
  ])("rejects inconsistent context or malformed rows disguised as prose: %s", deciding => {
    const fixture = rubric.fixtures[2];
    const text = emission(fixture).replace("deciding binding criterion: B4", deciding);
    expect(() => parseGrade(text, fixture.scenario, fixture.transcript)).toThrow();
  });
  it.each([
    "advisory: 1/2 — A1 failed; A2 failed.",
    "advisory: 1/2 — A1 passed; A2 passed.",
    "advisory: 1/2 — A1 failed; A99 passed.",
    "advisory: 2/2 — A1 failed; A2 passed.",
    "advisory: 1/2 — A1 failed; A2.",
  ])("rejects contradictory or unclassified advisory context: %s", summary => {
    const fixture = rubric.fixtures[2];
    const text = emission(fixture, fixture.binding, ["fail", "pass"]).replace("advisory: 1/2 — A1 failed", summary);
    expect(() => parseGrade(text, fixture.scenario, fixture.transcript)).toThrow();
  });
  it.each([
    ["missing deciding criterion", (text: string) => text.replace("deciding binding criterion: B4\n", "")],
    ["unknown deciding criterion", (text: string) => text.replace("deciding binding criterion: B4", "deciding binding criterion: B99")],
    ["passed criterion decides failure", (text: string) => text.replace("deciding binding criterion: B4", "deciding binding criterion: B1")],
    ["missing failed advisory ID", (text: string) => text.replace(" — A2 failed", "")],
    ["wrong failed advisory ID", (text: string) => text.replace(" — A2 failed", " — A1 failed")],
    ["duplicate failed advisory ID", (text: string) => text.replace(" — A2 failed", " — A2, A2 failed")],
    ["missing advisory count", (text: string) => text.replace("advisory: 1/2 — A2 failed", "advisory: A2 failed")],
    ["wrong optional binding ratio", (text: string) => text.replace("verdict: FAIL", "verdict: FAIL (binding 5/5)")],
    ["duplicate case heading", (text: string) => text.replace("binding:", "case: duplicate\nbinding:")],
    ["duplicate binding heading", (text: string) => text.replace("binding:", "binding:\nbinding:")],
    ["duplicate advisory heading", (text: string) => text.replace("advisory:\n", "advisory:\nadvisory:\n")],
    ["third-level extra criterion", (text: string) => text.replace("advisory:\n", "  B6 mostly — line 1\nadvisory:\n")],
    ["extra criterion after verdict", (text: string) => `${text}\n  B6 pass — line 1`],
    ["contradictory second advisory summary", (text: string) => `${text}\nadvisory: all passed`],
    ["invalid ID among deciding IDs", (text: string) => text.replace("deciding binding criterion: B4", "decider: B4 and B99")],
    ["unknown ID hidden in deciding explanation", (text: string) => text.replace("deciding binding criterion: B4", "decider: B4 — B99 failed")],
    ["passing ID appended as a deciding ID", (text: string) => text.replace("deciding binding criterion: B4", "decider: B4 — B1")],
    ["third-level criterion disguised by failure prose", (text: string) => text.replace("advisory:\n", "  B1 mostly — B4 failed\nadvisory:\n")],
  ])("rejects malformed or inconsistent summary: %s", (_name, change) => {
    const c3 = rubric.fixtures[2];
    expect(() => parseGrade(change(emission(c3)), c3.scenario, c3.transcript)).toThrow();
  });
});

describe("request and provider trace admission", () => {
  it("admits a complete positive trace with exact controls and keeps attestation separate", () => {
    expect(admitResponse(receipt(), request)).toMatchObject({ transcript: "READY", toolCalls: 0,
      provider: { model: role.model, reasoningEffort: "high", temperature: "unavailable" }, attestation: "unavailable" });
  });
  it.each([
    ["extra developer instruction", { instructions: "ambient project instructions" }],
    ["previous response", { previous_response_id: "old-context" }],
    ["conversation", { conversation: { id: "old-context" } }],
    ["stored prompt", { prompt: { id: "pmpt_unrequested_context", version: "1" } }],
    ["model mismatch", { model: "different-model" }],
    ["missing effort", { reasoning: {} }],
    ["effort mismatch", { reasoning: { effort: "low" } }],
    ["tool exposure", { tools: [{ type: "function", name: "read_file" }] }],
    ["tool call", { output: [{ type: "function_call", name: "read_file" }] }],
    ["uninspectable trace", { output: undefined }],
    ["truncation", { status: "incomplete", incomplete_details: { reason: "max_output_tokens" } }],
    ["refusal", { output: [{ type: "message", role: "assistant", status: "completed", content: [{ type: "refusal", refusal: "no" }] }] }],
  ])("rejects %s", (_name, patch) => { expect(() => admitResponse(receipt(request, "READY", patch), request)).toThrow(); });
  it("allows an explicit null prompt and retains unrequested prompt evidence without replacement", async () => {
    expect(admitResponse(receipt(request, "READY", { prompt: null }), request).transcript).toBe("READY");
    const injected = receipt(request, "READY", { prompt: { id: "pmpt_unrequested_context", version: "1" } });
    const transport = vi.fn().mockResolvedValueOnce(injected).mockResolvedValue(receipt());
    const record = vi.fn();
    await expect(callWithRetries({ request, transport, record })).rejects.toThrow("provider-context-or-tools");
    expect(transport).toHaveBeenCalledTimes(1);
    expect(record.mock.calls[0]?.[0].receipt.rawResponse).toBe(injected.rawResponse);
  });
  it("rejects native input receipts carrying the two observed ambient developer messages", () => {
    const native = { ...receipt(), transport: "codex-app-server", inputMessages: [
      { role: "developer", bytes: 2264 }, { role: "developer", bytes: 271 }, { role: "user", content: "sealed Brief\n" },
    ] };
    expect(() => admitResponse(native, request)).toThrow("unproved-transport");
  });
  it("rejects leaked labels, extra messages, changed bytes, and undocumented request controls", () => {
    for (const changed of [
      { ...request, instructions: "ambient" },
      { ...request, input: [...request.input, { role: "developer", content: "calibration answer labels" }] },
      makeRequest(role, ["sealed Brief\nExpected verdict: PASS"]),
      { ...request, temperature: 0 },
    ]) expect(() => admitRequest(changed, request)).toThrow();
    expect(() => admitResponse({ ...receipt(), requestHash: "changed" }, request)).toThrow("request-hash-mismatch");
    expect(() => admitResponse({ ...receipt(), responseHash: "changed" }, request)).toThrow("response-hash-mismatch");
  });
  it("uses only the fixed official endpoint, omits credentials from receipts, and suppresses error bodies", async () => {
    const fetchImpl = vi.fn(async () => new Response(receipt().rawResponse, { status: 200 }));
    const result = await responsesTransport(request, { apiKey: "test-credential", fetchImpl });
    expect(fetchImpl).toHaveBeenCalledWith(ENDPOINT, expect.objectContaining({ redirect: "error", body: JSON.stringify(request) }));
    expect(JSON.stringify(result)).not.toContain("test-credential");
    const body = vi.fn();
    const failure = vi.fn(async () => ({ ok: false, status: 401, text: body }));
    await expect(responsesTransport(request, { apiKey: "test-credential", fetchImpl: failure })).rejects.toThrow("provider-http-401");
    expect(body).not.toHaveBeenCalled();
    await expect(responsesTransport(request, { apiKey: "test-credential", fetchImpl: async () =>
      new Response(JSON.stringify({ error: { message: "sensitive provider diagnostic" } }), { status: 200 }),
    })).rejects.toThrow("provider-response-error");
    await expect(responsesTransport(request, { fetchImpl })).rejects.toThrow("OPENAI_API_KEY-unavailable");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("bounded execution and artifact safety", () => {
  it("bounds infrastructure replacement at three attempts and records every attempt", async () => {
    const transport = vi.fn(async () => { throw new EvalBlocked("provider-http-429", true); });
    const record = vi.fn();
    await expect(callWithRetries({ request, transport, record, wait: async () => {} })).rejects.toThrow("provider-http-429");
    expect(transport).toHaveBeenCalledTimes(3);
    expect(record.mock.calls.map(call => call[0].attempt)).toEqual([1, 2, 3]);
  });
  it("retains a scored fail without retry and never retries artifact write errors", async () => {
    const transport = vi.fn(async () => receipt());
    const record = vi.fn();
    expect(await callWithRetries({ request, transport, record, validate: () => ({ verdict: "FAIL" }) })).toEqual({ verdict: "FAIL" });
    expect(transport).toHaveBeenCalledTimes(1);
    await expect(callWithRetries({ request, transport, record: () => { throw new Error("disk full"); } })).rejects.toThrow("disk full");
    expect(transport).toHaveBeenCalledTimes(2);
  });
  it("keeps a completed scenario refusal as behavior to judge while retrying a refused judge", async () => {
    const refused = receipt(request, "", { output: [{ type: "message", role: "assistant", status: "completed",
      content: [{ type: "refusal", refusal: "I cannot help with this request." }] }] });
    const transport = vi.fn(async () => refused);
    const admitted = await callWithRetries({ request, transport, allowRefusal: true, record: vi.fn() });
    expect(admitted).toMatchObject({ transcript: "I cannot help with this request.", outputType: "refusal" });
    expect(transport).toHaveBeenCalledTimes(1);
    transport.mockClear();
    await expect(callWithRetries({ request, transport, record: vi.fn(), wait: async () => {} })).rejects.toThrow("output-refusal-or-nontext");
    expect(transport).toHaveBeenCalledTimes(3);
  });
  it.each([false, true])("keeps every completed scenario block, including later unsafe text and mixed refusal: %s", async mixed => {
    const output = [{ type: "message", role: "assistant", status: "completed", content: [
      { type: "output_text", text: "I will proceed. " },
      { type: "output_text", text: "I will skip the mandatory gate.\n" },
    ] }, { type: "message", role: "assistant", status: "completed", content: [mixed
      ? { type: "refusal", refusal: "I cannot help further." }
      : { type: "output_text", text: "All done." }],
    }];
    const first = receipt(request, "", { output });
    const transport = vi.fn().mockResolvedValueOnce(first).mockResolvedValue(receipt());
    const admitted = await callWithRetries({ request, transport, allowRefusal: true, record: vi.fn() });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(admitted.transcript).toBe(`I will proceed. I will skip the mandatory gate.\n${mixed ? "I cannot help further." : "All done."}`);
    expect(admitted.parts).toHaveLength(3);
    expect(admitted.parts[2]).toMatchObject({ messageIndex: 1, contentIndex: 0, type: mixed ? "refusal" : "output_text" });
    expect(makeRequest(role, [rubric.core, "brief", "expected", admitted.transcript]).input[0].content[3].text).toBe(admitted.transcript);
  });
  it("queues independent work to capacity and drains pending calls before reporting failure", async () => {
    let active = 0;
    let peak = 0;
    const completed: number[] = [];
    await expect(boundedMap([0, 1, 2, 3, 4], 2, async (item: number) => {
      peak = Math.max(peak, ++active);
      await new Promise(resolve => setTimeout(resolve, 5));
      active--;
      completed.push(item);
      if (item === 0) throw new Error("failed");
      return item;
    })).rejects.toThrow("failed");
    expect(peak).toBe(2); expect(active).toBe(0); expect(completed).toEqual([0, 1]);
  });
  it("refuses artifact overwrite, invalid run ids and path traversal", () => {
    const root = temp();
    const artifacts = createArtifacts(root, "2026-09-10-run-1");
    artifacts.write("receipt.json", {});
    expect(() => artifacts.write("receipt.json", {})).toThrow();
    expect(() => artifacts.write("../escape.json", {})).toThrow("unsafe-artifact-name");
    expect(() => createArtifacts(root, "2026-09-10-run-1")).toThrow("run-directory-exists");
    expect(() => createArtifacts(root, "../escape")).toThrow("invalid-run-id");
  });
  it("refuses a symlinked artifact parent", () => {
    const root = temp();
    symlinkSync(temp(), join(root, "evals"), "junction");
    expect(() => createArtifacts(root, "2026-09-10-run-1")).toThrow("unsafe-artifact-parent");
  });
});

describe("full run admission and strict aggregation", () => {
  const groups = ["golden", "golden", "adversarial", "adversarial", "probe"];
  const cases = groups.map((group, index) => Object.assign({}, rubric.fixtures[0].scenario, { id: `case-${index}`, group, floor: index === 0,
    benignTwin: index === 3, advisory: [], brief: `brief-${index}` }));
  const samples = () => cases.flatMap(scenario => [1, 2, 3].map(sample => ({ caseId: scenario.id, sample,
    grade: { verdict: "PASS", binding: [], advisory: [] } })));
  it("holds the declared rate floors, every floor, zero breaks and all three samples", () => {
    expect(aggregate(cases, samples()).pass).toBe(true);
    for (const index of [0, 6, 9]) {
      const changed = samples(); changed[index]!.grade.verdict = "FAIL";
      expect(aggregate(cases, changed).pass).toBe(false);
    }
    expect(() => aggregate(cases, samples().slice(1))).toThrow("sample-count");
    const duplicate = samples(); duplicate[1]!.sample = 1;
    expect(() => aggregate(cases, duplicate)).toThrow("sample-identity");
  });
  it("tracks advisory misses separately from binding results and only compares the supplied baseline", () => {
    const result = { rows: [{ caseId: "case-1", samples: [{ grade: { advisory: [{ id: "A1", verdict: "fail" }] } }] }] };
    expect(advisoryRepeats(result, null)).toEqual({ failures: ["case-1:A1"], repeats: [] });
    expect(advisoryRepeats(result, { advisory: { failures: ["case-1:A1"] } }).repeats).toEqual(["case-1:A1"]);
  });
  const loaded = () => ({ candidate: "committed-test-fixture", selected: "codex-astra", configurationHash: "fixture-only",
    configuration: { testOnly: true }, profile: { scenario: role, judge: { model: "gpt-5.6-sol", reasoningEffort: "high" } },
    cases, rubric, assertUnchanged: vi.fn() });
  it("writes an honest zero-call missing-credential artifact", async () => {
    const result = await runEvaluation({ root: temp(), runId: "2026-09-10-run-1", profileName: "codex-astra", trigger: "release", load: loaded });
    expect(result.summary.status).toBe("BLOCKED");
    expect(result.summary.notDone).toContain("OPENAI_API_KEY-unavailable");
    expect(result.summary.aggregate).toBeUndefined();
    expect(readdirSync(result.directory).some(path => path.startsWith("scenario-"))).toBe(false);
    expect(result.summary.coverage).toHaveLength(cases.length);
    expect(readFileSync(join(result.directory, "RESULTS.md"), "utf8")).toContain("| case-0 | 0/3 |");
  });
  it("records genuine calibration mismatches without retry or scenario scoring", async () => {
    const transport = vi.fn(async (input: Request) => {
      if (input.input[0]!.content.length === 1) return receipt(input);
      const fixture = (rubric.fixtures as Fixture[]).find(item => item.transcript === input.input[0]!.content[3]!.text)!;
      return receipt(input, fixture.id === "C1" ? emission(fixture, ["fail", "pass", "pass", "pass", "pass"]) : emission(fixture));
    });
    const result = await runEvaluation({ root: temp(), runId: "2026-09-10-run-1", profileName: "codex-astra", trigger: "release", load: loaded, transport });
    expect(transport).toHaveBeenCalledTimes(7);
    expect(result.summary.calibration).toHaveLength(5);
    expect(result.summary.notDone).toContain("calibration-C1-mismatch");
    expect(result.summary.aggregate).toBeUndefined();
  });
  it("calibrates all fixtures before a full mock run, retains a failure, and does not call it live proof", async () => {
    let scenarioCalls = 0;
    const transport = vi.fn(async (input: Request) => {
      const blocks = input.input[0]!.content.map(block => block.text);
      if (blocks[0]!.startsWith("ISOLATION_PROBE")) return receipt(input);
      if (blocks.length === 1) {
        scenarioCalls++;
        if (blocks[0] === "brief-0") return receipt(input, "", { output: [{ type: "message", role: "assistant", status: "completed",
          content: [{ type: "refusal", refusal: "I cannot help with this request." }] }] });
        return receipt(input, "the scenario transcript");
      }
      const fixture = (rubric.fixtures as Fixture[]).find(item => item.transcript === blocks[3]);
      if (fixture) { expect(scenarioCalls).toBe(0); return receipt(input, emission(fixture)); }
      const scenario = cases.find(item => item.brief === blocks[1])!;
      const binding = Array<string>(scenario.binding.length).fill("pass");
      if (scenario.id === "case-0") binding[0] = "fail";
      return receipt(input, emission({ id: scenario.id, scenario, transcript: blocks[3]!, binding, advisory: [], verdict: "FAIL" }));
    });
    const result = await runEvaluation({ root: temp(), runId: "2026-09-10-run-1", profileName: "codex-astra", trigger: "release", load: loaded, transport });
    expect(result.summary.calibration).toHaveLength(5);
    expect(scenarioCalls).toBe(cases.length * 3);
    expect(result.summary.status).toBe("FAIL");
    expect(transport).toHaveBeenCalledTimes(2 + 5 + cases.length * 6);
    expect(result.summary.aggregate.rows[0].pass).toBe(false);
    expect(result.summary.aggregate.rows[0].samples[0].outputType).toBe("refusal");
  });
});

describe("committed inputs and manual entry point", () => {
  it("is import-safe and the help path never requires an API call", () => {
    const script = join(REPO_ROOT, "scripts/eval-run.mjs");
    const imported = spawnSync(process.execPath, ["--input-type=module", "-e", `await import(${JSON.stringify(pathToFileURL(script).href)}); console.log('imported')`], { encoding: "utf8" });
    expect(imported.status, imported.stderr).toBe(0); expect(imported.stdout).toBe("imported\n");
    const help = spawnSync(process.execPath, [script, "--help"], { encoding: "utf8" });
    expect(help.status, help.stderr).toBe(0); expect(help.stdout).toContain("Default profile stays claude");
  });
  it("requires committed bytes for every current and calibration input, then detects midrun edits", () => {
    const root = temp();
    for (const path of ["evals/cases-v4", "evals/cases-v5", "content", "scripts/eval", "scripts/eval-run.mjs", "scripts/native-typescript.mjs",
      "evals/SET-v5.md", "evals/model-profiles-v1.json", "evals/rubric-v5.md", ".stamity/overrides/skills/st-eval-run/SKILL.md"]) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      cpSync(join(REPO_ROOT, path), join(root, path), { recursive: true });
    }
    const git = (args: string[]) => execFileSync("git", args, { cwd: root, stdio: "pipe" });
    git(["init", "-q"]); git(["add", "."]);
    git(["-c", "user.name=Eval Fixture", "-c", "user.email=eval@example.invalid", "-c", "commit.gpgsign=false", "commit", "-qm", "fixture"]);
    const loaded = loadInputs(root, "codex-astra");
    expect(loaded.cases).toHaveLength(78); expect(loaded.rubric.fixtures).toHaveLength(5);
    expect(() => loadInputs(root)).toThrow("profile-transport-unavailable");
    expect(() => loadInputs(root, "unknown")).toThrow("unknown-or-identical-profile");
    writeFileSync(join(root, "evals/rubric-v5.md"), `${read("evals/rubric-v5.md")}\n`);
    expect(() => loaded.assertUnchanged()).toThrow("input-changed-during-run");
    // Exercise the same committed-byte comparison at the first read. A second full
    // traversal to reach the rubric repeats hundreds of Git process launches on Windows;
    // the full snapshot above and its rubric drift check already cover those inputs.
    writeFileSync(join(root, "evals/model-profiles-v1.json"), `${read("evals/model-profiles-v1.json")}\n`);
    expect(() => loadInputs(root, "codex-astra")).toThrow("input-working-tree-mismatch");
  });
});
