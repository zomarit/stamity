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
type Reply = { value: unknown; status?: number };

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
if (reply.status) { process.stderr.write('Private diagnostic must not reach the PR or console'); process.exit(reply.status); }
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
