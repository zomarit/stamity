import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { parse } from "yaml";
import { isolatedEnv, makeScratch } from "./fixtures.ts";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const workflow = parse(readFileSync(join(ROOT, ".github/workflows/upstream-update.yml"), "utf8")) as {
  jobs: { publish: { steps: { name: string; run?: string }[] } };
};
const run = workflow.jobs.publish.steps.find((step) => step.name === "Check the target branch's landing policy")!.run!;
const AVAILABLE = process.platform !== "win32" && spawnSync("bash", ["--version"]).status === 0
  && spawnSync("jq", ["--version"]).status === 0;
// `body` reproduces what `gh api` does on an HTTP error: it writes the API's own JSON error
// document to stdout and still exits non-zero. Verified against the live endpoint on 2026-09-17
// with gh 2.86.0 — an unprotected branch answers `{"message":"Branch not protected",...}` with
// `gh: Branch not protected (HTTP 404)` on stderr. Replies without a `body` keep the older
// fixture shape exactly: no stdout at all, which is the unreadable-surface case.
type Reply = { value: unknown; status?: number; body?: unknown };

// Execute the shipping shell with real jq. Only GitHub responses are substituted; these
// fixtures exercise the permission boundary independently of the workflow's parser.
describe.skipIf(!AVAILABLE)("upstream landing policy — executable GitHub boundary", () => {
  const scratch = makeScratch("upstream-landing-policy");
  let ordinal = 0;
  afterAll(() => scratch.cleanup());

  function invoke(overrides: Record<string, Reply> = {}, branch = "main") {
    const dir = join(scratch.dir, String(ordinal++));
    const bin = join(dir, "bin");
    mkdirSync(bin, { recursive: true });
    const path = encodeURIComponent(branch);
    const responses: Record<string, Reply> = {
      [`repos/example/downstream/rules/branches/${path}`]: { value: [[]] },
      "repos/example/downstream": { value: { allow_merge_commit: true } },
      [`repos/example/downstream/branches/${path}/protection`]: { value: { required_linear_history: { enabled: false } } },
      ...overrides,
    };
    writeFileSync(join(dir, "responses.json"), JSON.stringify(responses));
    const gh = join(bin, "gh");
    writeFileSync(gh, `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.CALLS, JSON.stringify(args) + '\\n');
const endpoint = args.find((arg) => arg.startsWith('repos/'));
const reply = JSON.parse(fs.readFileSync(process.env.RESPONSES, 'utf8'))[endpoint];
if (args[0] !== 'api' || reply === undefined) process.exit(9);
if (reply.status) {
  if (reply.body !== undefined) process.stdout.write(JSON.stringify(reply.body));
  process.stderr.write('Private diagnostic must not reach the PR or console');
  process.exit(reply.status);
}
process.stdout.write(JSON.stringify(reply.value));
`);
    chmodSync(gh, 0o755);
    const env = {
      ...isolatedEnv(dir), PATH: `${bin}${delimiter}${process.env["PATH"]}`,
      GH_REPO: "example/downstream", INTEGRATION_BRANCH: branch, ARTIFACT_DIR: dir,
      GITHUB_OUTPUT: join(dir, "output"), CALLS: join(dir, "calls"), RESPONSES: join(dir, "responses.json"),
    };
    writeFileSync(env.GITHUB_OUTPUT, "");
    writeFileSync(env.CALLS, "");
    const result = spawnSync("bash", ["-c", run], { cwd: dir, env, encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
    const policy = readFileSync(join(dir, "landing-policy.md"), "utf8");
    expect(result.stdout + policy).not.toContain("Private diagnostic");
    return { ...result, policy, output: readFileSync(env.GITHUB_OUTPUT, "utf8"),
      calls: readFileSync(env.CALLS, "utf8").trim().split("\n").map((line) => JSON.parse(line) as string[]) };
  }

  it("checks all three surfaces before reporting merge settings permit ancestry", () => {
    const result = invoke({}, "integration/main");
    expect(result.output).toContain("checked=true");
    expect(result.output).toContain("warning=false");
    // Added with REQ-UPSTREAM-011: the classic surface now reports WHICH answer it got, so
    // "read a protection document" and "there is no classic protection" stay distinguishable.
    expect(result.output).toContain("classic=read");
    expect(result.calls).toHaveLength(3);
    const rules = result.calls.find((args) => args.some((arg) => arg.includes("rules/branches")))!;
    expect(rules).toEqual(expect.arrayContaining(["--paginate", "--slurp"]));
    expect(result.calls.flat().join(" ")).toContain("integration%2Fmain");
  });

  it("warns for legacy linear history when the ruleset endpoint returns no rules", () => {
    const result = invoke({ "repos/example/downstream/branches/main/protection": { value: { required_linear_history: { enabled: true } } } });
    expect(result.output).toContain("checked=true");
    expect(result.output).toContain("warning=true");
    expect(result.policy).toContain("required linear history");
    expect(result.stdout).not.toContain("permits a merge commit");
  });

  it("warns when repository settings disallow merge commits", () => {
    const result = invoke({ "repos/example/downstream": { value: { allow_merge_commit: false } } });
    expect(result.output).toContain("warning=true");
    expect(result.policy).toContain("repository");
  });

  it.each([
    { type: "required_linear_history" },
    { type: "pull_request", parameters: { allowed_merge_methods: ["squash", "rebase"] } },
    { type: "merge_queue", parameters: { merge_method: "SQUASH" } },
  ])("reads restrictive rules from later pages: $type", (rule) => {
    const result = invoke({ "repos/example/downstream/rules/branches/main": { value: [[{ type: "non_fast_forward" }], [rule]] } });
    expect(result.output).toContain("warning=true");
    expect(result.policy).toContain("Squash and rebase both lose it");
  });

  it.each([
    "repos/example/downstream/rules/branches/main",
    "repos/example/downstream",
    "repos/example/downstream/branches/main/protection",
  ])("reports unreadable constraints as unchecked: %s", (endpoint) => {
    const result = invoke({ [endpoint]: { value: null, status: 1 } });
    expect(result.output).toContain("checked=false");
    expect(result.policy).toContain("NOT fully checked");
    expect(result.stdout).not.toContain("permits a merge commit");
  });

  // REQ-UPSTREAM-011. A branch protected by rulesets ONLY has no classic protection, and the
  // classic endpoint says so with a 404. Reading that as "unverified" pinned the
  // not-fully-checked note onto every such fork forever, which is the note losing its meaning.
  const PROTECTION = "repos/example/downstream/branches/main/protection";
  const NOT_PROTECTED = {
    message: "Branch not protected",
    documentation_url: "https://docs.github.com/rest/branches/branch-protection#get-branch-protection",
    status: "404",
  };

  it("records no classic protection from a 404 and leaves the check complete", () => {
    const result = invoke({ [PROTECTION]: { value: null, status: 1, body: NOT_PROTECTED } });
    expect(result.output).toContain("checked=true");
    expect(result.output).toContain("classic=none");
    expect(result.output).toContain("warning=false");
    // The whole point: no note at all, and the permissive sentence is still earned.
    expect(result.policy).toBe("");
    expect(result.stdout).not.toContain("NOT fully checked");
    expect(result.stdout).toContain("permit a merge commit");
    // The other two surfaces were still read, so the answer is not a shortcut.
    expect(result.calls).toHaveLength(3);
  });

  it("keeps a ruleset warning while recording no classic protection", () => {
    const result = invoke({
      [PROTECTION]: { value: null, status: 1, body: NOT_PROTECTED },
      "repos/example/downstream/rules/branches/main": { value: [[{ type: "required_linear_history" }]] },
    });
    expect(result.output).toContain("checked=true");
    expect(result.output).toContain("classic=none");
    expect(result.output).toContain("warning=true");
    expect(result.policy).toContain("required linear history");
    expect(result.policy).not.toContain("NOT fully checked");
  });

  it.each([
    ["403", { message: "Resource not accessible by integration", status: "403" }],
    ["404 for a branch that is not there", { message: "Branch not found", status: "404" }],
    ["a body with no message", { documentation_url: "https://docs.github.com/rest", status: "404" }],
    ["a body that is not an object", ["Branch not protected"]],
  ])("still reports classic protection unverified on %s", (_label, body) => {
    const result = invoke({ [PROTECTION]: { value: null, status: 1, body } });
    expect(result.output).toContain("checked=false");
    expect(result.output).toContain("classic=unchecked");
    expect(result.policy).toContain("NOT fully checked");
    expect(result.policy).toContain("classic branch protection");
    expect(result.stdout).not.toContain("permits a merge commit");
  });

  it("retains a known warning when legacy protection is unreadable", () => {
    const result = invoke({
      "repos/example/downstream": { value: { allow_merge_commit: false } },
      "repos/example/downstream/branches/main/protection": { value: null, status: 1 },
    });
    expect(result.output).toContain("checked=false");
    expect(result.output).toContain("warning=true");
    expect(result.policy).toContain("NOT fully checked");
    expect(result.policy).toContain("repository");
  });

  it.each([
    ["repos/example/downstream/rules/branches/main", { message: "Not Found" }],
    ["repos/example/downstream/rules/branches/main", [[{ type: "pull_request", parameters: {} }]]],
    ["repos/example/downstream", {}],
    ["repos/example/downstream/branches/main/protection", {}],
  ])("does not treat malformed successful responses as permissive: %s", (endpoint, value) => {
    const result = invoke({ [endpoint as string]: { value } });
    expect(result.output).toContain("checked=false");
    expect(result.stdout).not.toContain("permits a merge commit");
  });
});
