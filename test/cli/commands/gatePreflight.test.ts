import { execFileSync } from "node:child_process";
import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { enginesOf, gateCommand, readPushIdentity } from "../../../src/cli/commands/gate.ts";
import { VERSION } from "../../../src/composition/root.ts";
import { createManifest, writeManifest } from "../../../src/manifest/manifest.ts";
import { runInProcess } from "../../support/inProcess.ts";
import { NO_GIT_CONFIG } from "../../support/repoFixtures.ts";
import { useTempDir } from "../../support/tempDir.ts";

/**
 * u16-gate-verbs (REQ-FLOW-101, REQ-FLOW-103): `stamity gate preflight
 * --unattended` gathers u8's facts from the engine's own reads and folds them
 * through `runPreflight`; `stamity gate scan --text` screens one outbound text.
 *
 * Git runs for real in scratch repositories: the push facts are what git's
 * own config says, so a scripted runner would prove nothing. Only `gh api` is
 * replaced, below.
 */

/** Every REST call the verb made, and the answer each path gets. */
const rest = vi.hoisted(() => ({
  calls: [] as { path: string; hostname: string; method: string }[],
  routes: new Map<string, { status: number; json: unknown }>(),
}));

// Mocked: the real `ghApi` starts `gh`, which calls GitHub over the network
// under the machine's login; a unit test can reach neither. The verb's own
// work (which host, which paths, what it does with the answers) is unchanged.
vi.mock("../../../src/cli/engine/ghRunner.ts", () => ({
  ghApi: (request: { path: string; hostname: string; method: string }) => {
    const path = request.path.replace(/^\//, "");
    rest.calls.push({ path, hostname: request.hostname, method: request.method });
    return Promise.resolve(rest.routes.get(path) ?? { status: 404, json: { message: "Not Found" } });
  },
}));

const SEED_ENV = {
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CONFIG_GLOBAL: NO_GIT_CONFIG,
  GIT_CONFIG_SYSTEM: NO_GIT_CONFIG,
  GIT_AUTHOR_NAME: "Alice Example",
  GIT_AUTHOR_EMAIL: "alice@example.com",
  GIT_COMMITTER_NAME: "Alice Example",
  GIT_COMMITTER_EMAIL: "alice@example.com",
} as const;

function git(cwd: string, args: readonly string[]): string {
  return execFileSync("git", [...args], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, ...SEED_ENV } });
}

/** `gh auth setup-git`'s helper; the program need not exist, its shape is what binds. */
const GH_HELPER = "!/opt/tools/gh auth git-credential";
/** A helper value that must never reach the output. */
const OTHER_HELPER = "store --file /secret/creds-q7zk";
const HEADER = "AUTHORIZATION: basic c2VjcmV0LXZhbHVlLXE3ems=";
/**
 * The `@` of an SSH remote inside a `url.<base>.pushInsteadOf` key, joined at run time: the key's
 * `url.git` local part is not the bare `git` the leak gate spares, so the literal reads as an address.
 */
const AT = "@";

/** A writer's repository whose ruleset requires a pull request with no bypass: the verdict u8 passes. */
function protectedRepo(owner = "o", repo = "r", bypass = "never"): void {
  rest.routes.set(`repos/${owner}/${repo}`, { status: 200, json: { default_branch: "main", id: 1, permissions: { admin: false, push: true } } });
  rest.routes.set(`repos/${owner}/${repo}/rules/branches/main`, {
    status: 200,
    json: [{ type: "pull_request", ruleset_id: 7, ruleset_source_type: "Repository" }],
  });
  rest.routes.set(`repos/${owner}/${repo}/rulesets/7`, { status: 200, json: { enforcement: "active", current_user_can_bypass: bypass } });
}

describe("stamity gate preflight and scan --text", () => {
  const getRoot = useTempDir("gate-preflight");

  beforeEach(() => {
    rest.calls.length = 0;
    rest.routes.clear();
  });

  /**
   * A committed repository with `origin` at `url`, git's helpers reset and set
   * to `helpers`, a fresh canary, and a manifest at this version whose two
   * floor copies exist: everything u8 reads passes but what a case changes.
   * `version` is the pinned version the manifest records.
   */
  async function seedRepo(opts: { url?: string; helpers?: readonly string[]; canary?: boolean; version?: string } = {}): Promise<string> {
    const repo = getRoot().path(`repo-${Math.random().toString(36).slice(2, 8)}`);
    await mkdir(repo, { recursive: true });
    git(repo, ["init", "-q"]);
    await writeFile(join(repo, "base.txt"), "base\n");
    git(repo, ["add", "-A"]);
    git(repo, ["commit", "-q", "-m", "base"]);
    git(repo, ["remote", "add", "origin", opts.url ?? "https://github.com/o/r.git"]);
    for (const helper of ["", ...(opts.helpers ?? [GH_HELPER])]) git(repo, ["config", "--add", "credential.helper", helper]);
    const floors = { ".claude/rules/stamity-injection-screening.md": "injection-screening", ".claude/skills/stamity-question-protocol/SKILL.md": "question-protocol" };
    const manifest = createManifest({ tools: ["claude"], selection: { items: { agent: [], skill: [], rule: [], command: [] } }, generatorVersion: opts.version ?? VERSION });
    await Promise.all(
      Object.entries(floors).map(async ([path, id]) => {
        await mkdir(join(repo, path, ".."), { recursive: true });
        await writeFile(join(repo, path), `# ${id}\n`);
      }),
    );
    for (const [path, id] of Object.entries(floors)) manifest.ledger.push({ path, adapter: "claude", artifactId: id, artifactType: "rule" });
    await writeManifest(repo, manifest);
    if (opts.canary !== false) await writeFile(join(repo, ".stamity", "preflight-canary.json"), JSON.stringify({ at: new Date().toISOString() }));
    return repo;
  }

  /** A folder holding a file named `gh`, so the verb finds one on the `PATH` it is given. */
  async function ghBin(): Promise<string> {
    const bin = getRoot().path("bin");
    await mkdir(bin, { recursive: true });
    await Promise.all(
      ["gh", "gh.exe"].map(async (name) => {
        await writeFile(join(bin, name), "#!/bin/sh\nexit 1\n");
        await chmod(join(bin, name), 0o755);
      }),
    );
    return bin;
  }

  /**
   * Runs the verb in `cwd` with `HOME` at an empty folder, so no global git
   * config of the host reaches the read runner (it reads this process's
   * environment); `env` is the verb's own runtime environment.
   */
  async function gate(cwd: string, argv: readonly string[], env: Record<string, string> = {}) {
    const home = getRoot().path("home");
    await mkdir(home, { recursive: true });
    const overrides = { HOME: home, XDG_CONFIG_HOME: home };
    const previous = Object.fromEntries(Object.keys(overrides).map((key) => [key, process.env[key]]));
    Object.assign(process.env, overrides);
    try {
      const runtime = { PATH: await ghBin(), ...(process.platform === "win32" ? { PATHEXT: process.env["PATHEXT"] ?? ".EXE" } : {}), ...env };
      const result = await runInProcess([gateCommand], ["gate", ...argv], { cwd, env: runtime });
      const doc = argv.includes("--json") && result.stdout !== "" ? (JSON.parse(result.stdout) as Record<string, unknown>) : {};
      return { ...result, doc };
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  }

  const PREFLIGHT = ["preflight", "--unattended", "--json"];
  const stateOf = (doc: Record<string, unknown>, id: string): unknown =>
    (doc["checks"] as { id: string; state: string }[]).find((check) => check.id === id)?.state;
  const evidenceOf = (doc: Record<string, unknown>, id: string): string | undefined =>
    (doc["checks"] as { id: string; evidence: string }[]).find((check) => check.id === id)?.evidence;
  /** `GIT_CONFIG_COUNT` and its key and value pairs, as a run's environment hands git config. */
  const configPairs = (pairs: readonly (readonly [string, string])[]): Record<string, string> =>
    Object.fromEntries([
      ["GIT_CONFIG_COUNT", String(pairs.length)],
      ...pairs.flatMap(([key, value], index) => [
        [`GIT_CONFIG_KEY_${index}`, key],
        [`GIT_CONFIG_VALUE_${index}`, value],
      ]),
    ]);

  describe("the verdict through the verb", () => {
    it("passes a writer under a ruleset with no bypass, every REST call naming the host origin matched", async () => {
      const repo = await seedRepo();
      protectedRepo();

      const { code, doc } = await gate(repo, PREFLIGHT);

      expect(doc["refusals"]).toEqual([]);
      expect(code).toBe(0);
      expect(doc).toMatchObject({ ok: true, subcommand: "preflight", mode: "unattended", client: null, cloud: false });
      expect((doc["floors"] as unknown[]).length).toBe(2);
      expect(rest.calls.map((call) => call.path)).toEqual(["repos/o/r", "repos/o/r/rules/branches/main", "repos/o/r/rulesets/7"]);
      expect(new Set(rest.calls.map((call) => `${call.method} ${call.hostname}`))).toEqual(new Set(["GET github.com"]));
    });

    it("names GH_HOST's host on every call for an origin on that host", async () => {
      const repo = await seedRepo({ url: "https://ghe.example.com/o/r.git" });
      protectedRepo();

      const { code } = await gate(repo, PREFLIGHT, { GH_HOST: "ghe.example.com" });

      expect(code).toBe(0);
      expect(rest.calls.length).toBeGreaterThan(0);
      expect(new Set(rest.calls.map((call) => call.hostname))).toEqual(new Set(["ghe.example.com"]));
    });

    it("refuses a ruleset the account always bypasses, and passes a pull-request-only bypass with the review-state warning", async () => {
      const repo = await seedRepo();
      protectedRepo("o", "r", "always");
      // Classic protection that requires no pull request: with the ruleset bypassed, the branch is open.
      rest.routes.set("repos/o/r/branches/main/protection", { status: 200, json: {} });
      const open = await gate(repo, PREFLIGHT);
      protectedRepo("o", "r", "pull_requests_only");
      const merge = await gate(repo, PREFLIGHT);

      expect(open.code).toBe(1);
      expect(stateOf(open.doc, "direct-push")).toBe("refuse");
      expect(merge.code).toBe(0);
      expect(merge.doc["warnings"]).toContainEqual({ id: "review-state", reason: expect.stringContaining("pull_requests_only") as string });
    });

    it("reaches the organization role read through its own REST read for an administrator under an organization ruleset", async () => {
      const repo = await seedRepo();
      rest.routes.set("repos/o/r", { status: 200, json: { default_branch: "main", id: 42, permissions: { admin: true, push: true } } });
      rest.routes.set("repos/o/r/rules/branches/main", { status: 200, json: [{ type: "pull_request", ruleset_id: 9, ruleset_source_type: "Organization" }] });
      rest.routes.set("repos/o/r/rulesets/9", {
        status: 200,
        json: {
          enforcement: "active",
          current_user_can_bypass: "never",
          conditions: { ref_name: { include: ["~ALL"], exclude: [] }, repository_id: { repository_ids: [42] } },
        },
      });
      rest.routes.set("user/memberships/orgs/o", { status: 200, json: { role: "member" } });

      const { code } = await gate(repo, PREFLIGHT);

      expect(rest.calls.map((call) => call.path)).toContain("user/memberships/orgs/o");
      expect(code).toBe(0);
    });

    it("refuses hooks-loaded with no canary", async () => {
      const repo = await seedRepo({ canary: false });
      protectedRepo();

      const { code, doc } = await gate(repo, PREFLIGHT);

      expect(code).toBe(1);
      expect(doc["refusals"]).toContainEqual(expect.objectContaining({ id: "hooks-loaded" }));
    });

    it("reads no REST with no gh on PATH, and refuses direct-push as unknown", async () => {
      const repo = await seedRepo();
      protectedRepo();

      const { code, doc } = await gate(repo, PREFLIGHT, { PATH: getRoot().path("home") });

      expect(code).toBe(1);
      expect(stateOf(doc, "direct-push")).toBe("unknown");
      expect(rest.calls).toEqual([]);
    });

    it("refuses with no REST read where an Authorization header applies to the push URL, echoing no header, helper or URL", async () => {
      const repo = await seedRepo({ helpers: [OTHER_HELPER, GH_HELPER] });
      git(repo, ["config", "http.https://github.com/.extraheader", HEADER]);
      git(repo, ["remote", "set-url", "--push", "origin", "https://github.com/o/r-push-q7zk.git"]);
      protectedRepo();

      const json = await gate(repo, PREFLIGHT);
      const human = await gate(repo, ["preflight", "--unattended"]);

      expect(json.code).toBe(1);
      expect(stateOf(json.doc, "direct-push")).toBe("unknown");
      expect(rest.calls).toEqual([]);
      for (const output of [json.stdout, json.stderr, human.stdout, human.stderr]) {
        for (const value of ["c2VjcmV0", "creds-q7zk", "r-push-q7zk", "/opt/tools/gh"]) expect(output).not.toContain(value);
      }
    });

    it("passes where the run's environment sets GIT_CONFIG_* variables that keep gh's helper alone (build/73)", async () => {
      const repo = await seedRepo();
      protectedRepo();
      const global = getRoot().path("global-gitconfig");
      await writeFile(global, "[core]\n\tautocrlf = false\n");

      const { code, doc } = await gate(repo, PREFLIGHT, {
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_CONFIG_GLOBAL: global,
        GIT_CONFIG_COUNT: "1",
        GIT_CONFIG_KEY_0: "core.quotePath",
        GIT_CONFIG_VALUE_0: "false",
      });

      expect(doc["refusals"]).toEqual([]);
      expect(code).toBe(0);
    });

    it("refuses as configuration unreadable, not as a header, where git cannot read the push's configuration (build/73)", async () => {
      const repo = await seedRepo();
      protectedRepo();

      // A count with no key names a pair git refuses, so the config read fails.
      const { code, doc } = await gate(repo, PREFLIGHT, { GIT_CONFIG_COUNT: "1" });
      const check = (doc["checks"] as { id: string; state: string; evidence: string }[]).find((entry) => entry.id === "direct-push");

      expect(code).toBe(1);
      expect(check?.state).toBe("unknown");
      expect(check?.evidence).toContain("configuration unreadable");
      expect(check?.evidence).not.toContain("Authorization");
      expect(rest.calls).toEqual([]);
    });

    it.each([
      ["an insteadOf that puts a token in the URL's userinfo", "url.https://x-access-token:tok-q7zk@github.com/.insteadOf"],
      ["a pushInsteadOf that pushes over ssh", `url.git${AT}github.com:.pushInsteadOf`],
    ])("refuses where GIT_CONFIG_COUNT supplies %s, as the push would apply it (review/136)", async (_label, key) => {
      const repo = await seedRepo();
      protectedRepo();

      const { code, doc, stdout, stderr } = await gate(repo, PREFLIGHT, configPairs([[key, "https://github.com/"]]));

      expect(code).toBe(1);
      expect(stateOf(doc, "direct-push")).toBe("unknown");
      expect(`${stdout}${stderr}`).not.toContain("tok-q7zk");
    });

    it("reads --item's author through the verb: a read author refuses, a write author passes (review/139)", async () => {
      const repo = await seedRepo();
      protectedRepo();
      rest.routes.set("repos/o/r/issues/3", { status: 200, json: { user: { login: "reader" } } });
      rest.routes.set("repos/o/r/collaborators/reader/permission", { status: 200, json: { permission: "read" } });
      rest.routes.set("repos/o/r/issues/4", { status: 200, json: { user: { login: "writer" } } });
      rest.routes.set("repos/o/r/collaborators/writer/permission", { status: 200, json: { permission: "write" } });

      const read = await gate(repo, [...PREFLIGHT, "--item", "o/r#3"]);
      const write = await gate(repo, [...PREFLIGHT, "--item", "o/r#4"]);

      expect(read.code).toBe(1);
      expect(stateOf(read.doc, "input-author")).toBe("refuse");
      expect(evidenceOf(read.doc, "input-author")).toBe("o/r#3: reader has read permission on o/r");
      expect(write.code).toBe(0);
      expect(evidenceOf(write.doc, "input-author")).toBe("o/r#4: writer has write on o/r");
    });

    it("refuses GH_REPO naming another repository than origin's (review/139)", async () => {
      const repo = await seedRepo();
      protectedRepo();

      const { code, doc } = await gate(repo, PREFLIGHT, { GH_REPO: "x/y" });

      expect(code).toBe(1);
      expect(stateOf(doc, "direct-push")).toBe("refuse");
      expect(evidenceOf(doc, "direct-push")).toBe("GH_REPO names x/y, not the origin repository");
    });

    it("refuses a running CLI that is not the manifest's pinned version (review/139)", async () => {
      const repo = await seedRepo({ version: "0.0.1" });
      protectedRepo();

      const { code, doc } = await gate(repo, PREFLIGHT);

      expect(code).toBe(1);
      expect(stateOf(doc, "cli-pin")).toBe("refuse");
      expect(evidenceOf(doc, "cli-pin")).toBe(`the running CLI ${VERSION} is not the pinned version 0.0.1`);
    });

    it("refuses a node outside the CLI's own engines range (review/139)", async () => {
      const repo = await seedRepo();
      protectedRepo();
      const manifest = JSON.parse(await readFile(new URL("../../../package.json", import.meta.url), "utf8")) as { engines: { node: string } };
      const node = Object.getOwnPropertyDescriptor(process.versions, "node");
      Object.defineProperty(process.versions, "node", { ...node, value: "1.0.0" });
      let result: Awaited<ReturnType<typeof gate>>;
      try {
        result = await gate(repo, PREFLIGHT);
      } finally {
        if (node !== undefined) Object.defineProperty(process.versions, "node", node);
      }

      expect(result.code).toBe(1);
      expect(stateOf(result.doc, "node-engine")).toBe("refuse");
      expect(evidenceOf(result.doc, "node-engine")).toBe(`node 1.0.0 is outside engines ${manifest.engines.node}`);
    });

    it("refuses a floor copy the manifest lists and the checkout lacks (review/139)", async () => {
      const repo = await seedRepo();
      protectedRepo();
      await rm(join(repo, ".claude/rules/stamity-injection-screening.md"));

      const { code, doc } = await gate(repo, PREFLIGHT);

      expect(code).toBe(1);
      expect(stateOf(doc, "floors")).toBe("refuse");
      expect(evidenceOf(doc, "floors")).toBe("floor rules missing: injection-screening at .claude/rules/stamity-injection-screening.md");
    });

    it("refuses gate-scan where the scan cannot run, outside any repository (review/139)", async () => {
      const plain = getRoot().path("plain");
      await mkdir(plain, { recursive: true });

      const { code, doc } = await gate(plain, PREFLIGHT);

      expect(code).toBe(1);
      expect(stateOf(doc, "gate-scan")).toBe("refuse");
      expect(evidenceOf(doc, "gate-scan")).toBe("gate scan cannot run");
    });

    it.each([
      ["a second push URL over ssh", (repo: string) => {
        git(repo, ["remote", "set-url", "--add", "--push", "origin", "https://github.com/o/r.git"]);
        git(repo, ["remote", "set-url", "--add", "--push", "origin", "git@github.com:o/r.git"]);
      }],
      ["an https push URL carrying userinfo", (repo: string) => git(repo, ["remote", "set-url", "--push", "origin", "https://bot@github.com/o/r.git"])],
      ["a helper beside gh's", (repo: string) => git(repo, ["config", "--add", "credential.helper", OTHER_HELPER])],
    ])("refuses %s", async (_label, change) => {
      const repo = await seedRepo();
      change(repo);
      protectedRepo();

      const { code, doc } = await gate(repo, PREFLIGHT);

      expect(code).toBe(1);
      expect(stateOf(doc, "direct-push")).toBe("unknown");
    });
  });

  describe("the push facts (readPushIdentity)", () => {
    /** The facts as git's config gives them, with the host's global config out of reach. */
    async function facts(repo: string, env: Record<string, string> = {}) {
      const home = getRoot().path("home");
      await mkdir(home, { recursive: true });
      const previous = { HOME: process.env["HOME"], XDG_CONFIG_HOME: process.env["XDG_CONFIG_HOME"] };
      Object.assign(process.env, { HOME: home, XDG_CONFIG_HOME: home });
      try {
        return readPushIdentity(repo, env);
      } finally {
        for (const [key, value] of Object.entries(previous)) {
          if (value === undefined) delete process.env[key];
          else process.env[key] = value;
        }
      }
    }

    it("reads origin's fetch URL, and a set pushurl as the push URL, not the fetch URL", async () => {
      const repo = await seedRepo();
      git(repo, ["remote", "set-url", "--push", "origin", "https://github.com/o/r-push.git"]);

      const { fetchUrl, pushUrls } = await facts(repo);

      expect(fetchUrl).toBe("https://github.com/o/r.git");
      expect(pushUrls.map((entry) => entry.url)).toEqual(["https://github.com/o/r-push.git"]);
    });

    it("gives one fact per push URL", async () => {
      const repo = await seedRepo();
      git(repo, ["remote", "set-url", "--add", "--push", "origin", "https://github.com/o/r.git"]);
      git(repo, ["remote", "set-url", "--add", "--push", "origin", "git@github.com:o/r.git"]);

      const { pushUrls } = await facts(repo);

      expect(pushUrls.map((entry) => entry.url)).toEqual(["https://github.com/o/r.git", "git@github.com:o/r.git"]);
    });

    it("builds the helper list in config order, and an empty value resets it", async () => {
      const both = await seedRepo({ helpers: [OTHER_HELPER, GH_HELPER] });
      const reset = await seedRepo({ helpers: [OTHER_HELPER, "", GH_HELPER] });

      expect((await facts(both)).pushUrls[0]?.helpers).toEqual([OTHER_HELPER, GH_HELPER]);
      expect((await facts(reset)).pushUrls[0]?.helpers).toEqual([GH_HELPER]);
    });

    it("reads `gh auth setup-git`'s host-scoped reset and helper over a generic one as gh's alone", async () => {
      const repo = await seedRepo({ helpers: [OTHER_HELPER] });
      for (const host of ["https://github.com", "https://gist.github.com"]) {
        git(repo, ["config", "--add", `credential.${host}.helper`, ""]);
        git(repo, ["config", "--add", `credential.${host}.helper`, GH_HELPER]);
      }

      expect((await facts(repo)).pushUrls).toEqual([{ url: "https://github.com/o/r.git", helpers: [GH_HELPER], authorizationHeader: false, configUnreadable: false }]);
    });

    it("applies a URL-scoped helper and header only to the URLs they name", async () => {
      const repo = await seedRepo();
      git(repo, ["config", "credential.https://github.com/o/r.git.helper", OTHER_HELPER]);
      git(repo, ["config", "http.https://GitHub.com/o/r.git.extraHeader", HEADER]);
      git(repo, ["remote", "set-url", "--add", "--push", "origin", "https://github.com/o/r.git"]);
      git(repo, ["remote", "set-url", "--add", "--push", "origin", "https://github.com/o/r.git.other"]);

      const { pushUrls } = await facts(repo);

      expect(pushUrls).toEqual([
        { url: "https://github.com/o/r.git", helpers: [GH_HELPER, OTHER_HELPER], authorizationHeader: true, configUnreadable: false },
        { url: "https://github.com/o/r.git.other", helpers: [GH_HELPER], authorizationHeader: false, configUnreadable: false },
      ]);
    });

    it("applies a host-wide header to every path on the host, and not another host", async () => {
      const repo = await seedRepo();
      git(repo, ["config", "http.https://github.com/.extraheader", HEADER]);
      git(repo, ["remote", "set-url", "--add", "--push", "origin", "https://github.com/o/r.git"]);
      git(repo, ["remote", "set-url", "--add", "--push", "origin", "https://example.com/o/r.git"]);

      expect((await facts(repo)).pushUrls.map((entry) => entry.authorizationHeader)).toEqual([true, false]);
    });

    it("places nothing where a helper's scope cannot be placed", async () => {
      const wildcard = await seedRepo();
      git(wildcard, ["config", "credential.https://*.github.com.helper", OTHER_HELPER]);

      expect((await facts(wildcard)).pushUrls[0]?.helpers).toBeNull();
    });

    it("reads config the push's environment supplies through GIT_CONFIG_* variables like any other config (build/73)", async () => {
      const repo = await seedRepo();
      const global = getRoot().path("global-header");
      await writeFile(global, `[http "https://github.com/"]\n\textraheader = ${HEADER}\n`);

      const pairs = await facts(repo, { GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "credential.helper", GIT_CONFIG_VALUE_0: OTHER_HELPER });
      const file = await facts(repo, { GIT_CONFIG_GLOBAL: global });
      const none = await facts(repo, { GIT_CONFIG_COUNT: "0" });

      expect(pairs.pushUrls).toEqual([{ url: "https://github.com/o/r.git", helpers: [GH_HELPER, OTHER_HELPER], authorizationHeader: false, configUnreadable: false }]);
      expect(file.pushUrls).toEqual([{ url: "https://github.com/o/r.git", helpers: [GH_HELPER], authorizationHeader: true, configUnreadable: false }]);
      expect(none.pushUrls).toEqual([{ url: "https://github.com/o/r.git", helpers: [GH_HELPER], authorizationHeader: false, configUnreadable: false }]);
    });

    it("reads origin's URLs through an insteadOf or pushInsteadOf that GIT_CONFIG_* supplies (review/136)", async () => {
      const repo = await seedRepo();

      const instead = await facts(repo, configPairs([["url.https://bot@github.com/.insteadOf", "https://github.com/"]]));
      const push = await facts(repo, configPairs([[`url.git${AT}github.com:.pushInsteadOf`, "https://github.com/"]]));

      expect(instead.fetchUrl).toBe("https://bot@github.com/o/r.git");
      expect(instead.pushUrls.map((entry) => entry.url)).toEqual(["https://bot@github.com/o/r.git"]);
      expect(push.fetchUrl).toBe("https://github.com/o/r.git");
      expect(push.pushUrls.map((entry) => entry.url)).toEqual(["git@github.com:o/r.git"]);
    });

    it.each([
      ["a generic header and a generic reset", [["http.extraheader", HEADER], ["http.extraheader", ""]], false],
      ["a host header and a reset at the same scope", [["http.https://github.com/.extraheader", HEADER], ["http.https://github.com/.extraheader", ""]], false],
      ["a generic header and a host reset", [["http.extraheader", HEADER], ["http.https://github.com/.extraheader", ""]], false],
      ["a host header and a path reset", [["http.https://github.com/.extraheader", HEADER], ["http.https://github.com/o/.extraheader", ""]], false],
      ["a host header and a generic reset, which git skips", [["http.https://github.com/.extraheader", HEADER], ["http.extraheader", ""]], true],
      ["a path header and a host reset, which git skips", [["http.https://github.com/o/r.git.extraheader", HEADER], ["http.https://github.com/.extraheader", ""]], true],
      [
        "a generic reset after a host header of another name, which git skips",
        [["http.extraheader", HEADER], ["http.https://github.com/.extraheader", "X-Trace: 1"], ["http.extraheader", ""]],
        true,
      ],
      ["a header after a reset", [["http.extraheader", ""], ["http.extraheader", HEADER]], true],
      ["a reset whose scope cannot be placed", [["http.extraheader", HEADER], ["http.https://*.github.com/.extraheader", ""]], true],
    ] as const)("reads %s as git applies it (review/141)", async (_label, pairs, header) => {
      const repo = await seedRepo();

      expect((await facts(repo, configPairs(pairs))).pushUrls.map((entry) => entry.authorizationHeader)).toEqual([header]);
    });

    it("reports the configuration unreadable, with no helper and no header, where git cannot read it (build/73)", async () => {
      const repo = await seedRepo();

      // A count with no key names a pair git refuses, so the read fails.
      expect((await facts(repo, { GIT_CONFIG_COUNT: "1" })).pushUrls).toEqual([
        { url: "https://github.com/o/r.git", helpers: null, authorizationHeader: false, configUnreadable: true },
      ]);
    });

    it("gives no fetch URL and no push URL where origin is absent", async () => {
      const repo = await seedRepo();
      git(repo, ["remote", "remove", "origin"]);

      expect(await facts(repo)).toEqual({ fetchUrl: null, pushUrls: [] });
    });
  });

  describe("the engines range (enginesOf, review/142)", () => {
    it.each([
      ["a declared range", `{"engines":{"node":">=22.22.2"}}`, ">=22.22.2"],
      ["no engines field", `{"name":"x"}`, undefined],
      ["engines without node", `{"engines":{"npm":">=10"}}`, undefined],
      ["a package.json that is not JSON", `{"engines":`, null],
      ["a package.json that is not an object", `["engines"]`, null],
      ["engines that is not an object", `{"engines":">=22"}`, null],
      ["engines.node that is not a string", `{"engines":{"node":22}}`, null],
    ])("%s", async (_name, body, expected) => {
      await getRoot().seedFiles({ "pkg/package.json": body });
      expect(enginesOf(getRoot().path("pkg", "package.json"))).toBe(expected);
    });

    it("a missing package.json is unreadable (null), not none declared", () => {
      expect(enginesOf(getRoot().path("absent", "package.json"))).toBeNull();
    });
  });

  describe("usage", () => {
    it.each([
      ["no --unattended", ["preflight", "--json"]],
      ["an --item that is not owner/repo#n", ["preflight", "--unattended", "--item", "o/r/1", "--json"]],
      ["--base on preflight", ["preflight", "--unattended", "--base", "HEAD", "--json"]],
      ["--text without --label", ["scan", "--text", "x.md", "--json"]],
      ["--item on classify", ["classify", "--paths", "a.md", "--item", "o/r#1", "--json"]],
    ])("exits 2 on %s", async (_label, argv) => {
      const { code, stdout } = await gate(getRoot().dir, argv);

      expect(code).toBe(2);
      expect(stdout).toBe("");
    });

    it("lists preflight and --text in --help", async () => {
      const { code, stdout } = await gate(getRoot().dir, ["--help"]);
      const help = stdout.replaceAll(/\s+/g, " ");

      expect(code).toBe(0);
      expect(help).toContain("preflight");
      expect(help).toContain("--text <file>");
      expect(help).toContain("--unattended");
    });
  });

  describe("scan --text", () => {
    const PARTS = ["Q7ZK4M2T", "W9XRB3NH", "C6VJ8PDL", "F5YG2S7A", "KE4U"];
    const TOKEN = ["gh", "p", "_", ...PARTS].join("");
    const FRAGMENTS = Array.from({ length: PARTS.join("").length - 5 }, (_, at) => PARTS.join("").slice(at, at + 6));

    it("exits 1 on a token-shaped line, naming label, line and rule and no fragment of the value", async () => {
      await getRoot().seedFiles({ "body.md": `## Summary\n\nthe run closed\ntoken ${TOKEN}\n` });

      const json = await gate(getRoot().dir, ["scan", "--text", "body.md", "--label", "pr-body", "--json"]);
      const human = await gate(getRoot().dir, ["scan", "--text", "body.md", "--label", "pr-body"]);

      expect(json.code).toBe(1);
      expect(json.doc).toMatchObject({ ok: false, subcommand: "scan", label: "pr-body", hits: [{ label: "pr-body", line: 4, rule: "github-token" }] });
      expect(human.stdout).toContain("pr-body:4  github-token");
      for (const output of [json.stdout, json.stderr, human.stdout, human.stderr]) {
        for (const fragment of FRAGMENTS) expect(output).not.toContain(fragment);
      }
    });

    it("exits 0 on a clean text", async () => {
      await getRoot().seedFiles({ "reply.md": "Fixed in the next push.\n" });

      const { code, doc } = await gate(getRoot().dir, ["scan", "--text", "reply.md", "--label", "reply", "--json"]);

      expect(code).toBe(0);
      expect(doc).toMatchObject({ ok: true, label: "reply", hits: [] });
    });

    it("exits 1 on a text past the content cap, never clean", async () => {
      await getRoot().seedFiles({ "long.md": `${"a".repeat(250_001)}\n` });

      const { code, doc } = await gate(getRoot().dir, ["scan", "--text", "long.md", "--label", "morning", "--json"]);

      expect(code).toBe(1);
      expect(doc["reason"]).toBe("long.md is longer than 250000 characters, so it was not scanned");
      expect(doc).not.toHaveProperty("hits");
    });

    it("exits 1 naming the path of a missing file", async () => {
      const { code, doc } = await gate(getRoot().dir, ["scan", "--text", "gone.md", "--label", "comment", "--json"]);

      expect(code).toBe(1);
      expect(doc["reason"]).toBe("gone.md does not exist");
    });
  });
});

