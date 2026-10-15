import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { ghApi, ghApiArgs, parseGhInclude, type GhRequest } from "../../../src/cli/engine/ghRunner.ts";
import { useTempDir } from "../../support/tempDir.ts";

/**
 * The `gh api` door: the argument vector, the closed method and path sets
 * (refused before `gh` starts), the status read from `--include`'s head, and
 * the start itself through a stand-in `gh` on `PATH`.
 */

const HOST = "github.com";

describe("ghApiArgs", () => {
  it("builds api --hostname <host> --include --method <M> <path>, with --input - only for a body", () => {
    expect(ghApiArgs({ method: "GET", path: "/repos/acme/app/pulls?head=acme%3Ax&state=open", hostname: HOST })).toEqual([
      "api",
      "--hostname",
      "github.com",
      "--include",
      "--method",
      "GET",
      "repos/acme/app/pulls?head=acme%3Ax&state=open",
    ]);
    expect(ghApiArgs({ method: "POST", path: "repos/acme/app/pulls", body: { draft: true }, hostname: "ghe.example.com" })).toEqual([
      "api",
      "--hostname",
      "ghe.example.com",
      "--include",
      "--method",
      "POST",
      "--input",
      "-",
      "repos/acme/app/pulls",
    ]);
  });

  it("accepts the writes the draft pull request makes", () => {
    for (const request of [
      { method: "POST", path: "repos/acme/app/pulls", body: {}, hostname: HOST },
      { method: "PATCH", path: "repos/acme/app/pulls/7", body: {}, hostname: HOST },
      { method: "POST", path: "repos/acme/app/issues/7/comments", body: {}, hostname: HOST },
      { method: "POST", path: "repos/acme/app/pulls/7/comments", body: {}, hostname: HOST },
    ] as const) {
      expect(() => ghApiArgs(request), request.path).not.toThrow();
    }
  });

  it("refuses a method outside GET, POST and PATCH, graphql, a flag-shaped path, a URL of its own, a bad host and every other write", () => {
    const refused: Omit<GhRequest, "hostname">[] = [
      { method: "PUT" as GhRequest["method"], path: "repos/acme/app/pulls/7/merge" },
      { method: "DELETE" as GhRequest["method"], path: "repos/acme/app/git/refs/heads/x" },
      { method: "POST", path: "graphql", body: { query: "mutation { markPullRequestReadyForReview }" } },
      { method: "GET", path: "/graphql" },
      { method: "GET", path: "--method=PUT" },
      { method: "GET", path: "repos/acme/app/pulls {owner}" },
      { method: "GET", path: "repos/acme/../other/pulls" },
      { method: "POST", path: "repos/acme/app/pulls/7/merge", body: {} },
      { method: "PATCH", path: "repos/acme/app/pulls/7/merge", body: {} },
      { method: "POST", path: "repos/acme/app/git/refs", body: {} },
      { method: "PATCH", path: "repos/acme/app/git/refs/heads/main", body: {} },
      { method: "POST", path: "repos/acme/app/merges", body: {} },
      { method: "PATCH", path: "repos/acme/app/rulesets/1", body: {} },
      { method: "POST", path: "repos/acme/app/pulls?x=1", body: {} },
      { method: "PATCH", path: "repos/acme/app/pulls/0", body: {} },
      { method: "GET", path: "https://example.net/x" },
      { method: "GET", path: "http://example.net/repos/acme/app" },
      { method: "GET", path: "//example.net/x" },
      { method: "GET", path: "repos//example.net/x" },
      { method: "GET", path: "repos/acme:app/pulls" },
    ];
    for (const request of refused) {
      expect(() => ghApiArgs({ ...request, hostname: HOST }), `${request.method} ${request.path}`).toThrow(/gh api:/);
    }
    for (const hostname of ["", "--method=PUT", "-github.com", "Github.com", "github.com/x", "github.com:8443", "https://github.com", "a..b"]) {
      expect(() => ghApiArgs({ method: "GET", path: "repos/acme/app", hostname }), hostname).toThrow(/gh api: the host/);
    }
    expect(() => ghApiArgs({ method: "GET", path: "repos/acme/app" } as GhRequest)).toThrow(/gh api: the host/);
  });
});

describe("parseGhInclude", () => {
  it("reads the status from the head's first line and the JSON after the blank line", () => {
    const stdout = 'HTTP/2.0 422 Unprocessable Entity\r\nContent-Type: application/json\r\n\r\n{"message":"Validation Failed"}';
    expect(parseGhInclude(stdout)).toEqual({ status: 422, json: { message: "Validation Failed" } });
  });

  it("reads LF heads, an empty body as null, and a non-JSON body as null", () => {
    expect(parseGhInclude('HTTP/1.1 201 Created\nX: y\n\n[{"number":1}]\n')).toEqual({ status: 201, json: [{ number: 1 }] });
    expect(parseGhInclude("HTTP/2.0 204 No Content\r\nX: y\r\n\r\n")).toEqual({ status: 204, json: null });
    expect(parseGhInclude("HTTP/2.0 502 Bad Gateway\r\n\r\n<html>")).toEqual({ status: 502, json: null });
  });

  it("returns null for output with no HTTP head", () => {
    expect(parseGhInclude("")).toBeNull();
    expect(parseGhInclude('{"status":"200"}')).toBeNull();
  });
});

describe("ghApi", () => {
  const getRoot = useTempDir("gh-runner");

  it("rejects a refused request before gh starts, and an absent gh with ENOENT", async () => {
    const empty = getRoot().path("empty");
    await mkdir(empty);

    await expect(ghApi({ method: "POST", path: "graphql", body: {}, hostname: HOST }, { cwd: empty, env: { PATH: empty } })).rejects.toMatchObject({
      code: "GH_REFUSED",
    });
    await expect(ghApi({ method: "GET", path: "repos/acme/app", hostname: HOST }, { cwd: empty, env: { PATH: empty } })).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  // The stand-in takes gh's place on PATH. Mock reason: the real gh calls
  // GitHub's network under the operator's login, which no test may do. It logs
  // its arguments, its stdin and one variable, then prints a canned
  // `--include` answer; like gh, it colours the body when CLICOLOR_FORCE or
  // GH_FORCE_TTY reaches it, and the colour variables it got go to `env.log`.
  // Windows starts no shebang script, so these cases run on POSIX hosts; the
  // argument vector itself is proven on every host above.
  async function standIn(
    answer: string,
    exitCode: number,
    opts: { coloured?: string; readsStdin?: boolean } = {},
  ): Promise<{ bin: string; work: string; log: string; input: string; envLog: string }> {
    const bin = getRoot().path("bin");
    const work = getRoot().path("work");
    const log = getRoot().path("argv.log");
    const input = getRoot().path("stdin.log");
    const envLog = getRoot().path("env.log");
    const canned = getRoot().path("answer.txt");
    const colouredFile = getRoot().path("coloured.txt");
    await mkdir(bin);
    await mkdir(work);
    await writeFile(canned, answer, "utf8");
    await writeFile(colouredFile, opts.coloured ?? answer, "utf8");
    const readStdin = opts.readsStdin === false ? "" : `/bin/cat > '${input}'\n`;
    await writeFile(
      join(bin, "gh"),
      "#!/bin/sh\n" +
        `printf '%s\\n' "$@" "prompt=$GH_PROMPT_DISABLED" > '${log}'\n` +
        `printf '%s\\n' "NO_COLOR=$NO_COLOR" "CLICOLOR_FORCE=$CLICOLOR_FORCE" "GH_FORCE_TTY=$GH_FORCE_TTY" > '${envLog}'\n` +
        readStdin +
        `if [ -n "$CLICOLOR_FORCE" ] || [ -n "$GH_FORCE_TTY" ]; then /bin/cat '${colouredFile}'; else /bin/cat '${canned}'; fi\n` +
        `exit ${exitCode}\n`,
      "utf8",
    );
    await chmod(join(bin, "gh"), 0o755);
    return { bin, work, log, input, envLog };
  }

  it.skipIf(process.platform === "win32")("starts gh with the argument vector, hands the body on stdin and reads the status", async () => {
    const { bin, work, log, input } = await standIn('HTTP/2.0 201 Created\r\nContent-Type: application/json\r\n\r\n{"number":12}', 0);

    const response = await ghApi(
      { method: "POST", path: "/repos/acme/app/pulls", body: { title: "t", draft: true }, hostname: "ghe.example.com" },
      { cwd: work, env: { PATH: bin } },
    );

    expect(response).toEqual({ status: 201, json: { number: 12 } });
    expect(await readFile(log, "utf8")).toBe(
      "api\n--hostname\nghe.example.com\n--include\n--method\nPOST\n--input\n-\nrepos/acme/app/pulls\nprompt=1\n",
    );
    expect(JSON.parse(await readFile(input, "utf8"))).toEqual({ title: "t", draft: true });
  });

  it.skipIf(process.platform === "win32")("resolves a 4xx answer gh exits 1 on as its status", async () => {
    const { bin, work } = await standIn('HTTP/2.0 422 Unprocessable Entity\r\n\r\n{"message":"Validation Failed"}', 1);

    await expect(
      ghApi({ method: "POST", path: "repos/acme/app/pulls", body: {}, hostname: HOST }, { cwd: work, env: { PATH: bin } }),
    ).resolves.toEqual({
      status: 422,
      json: { message: "Validation Failed" },
    });
  });

  it.skipIf(process.platform === "win32")("parses the body with CLICOLOR_FORCE and GH_FORCE_TTY set in the parent environment", async () => {
    const head = "HTTP/2.0 200 OK\r\nContent-Type: application/json\r\n\r\n";
    const { bin, work, envLog } = await standIn(`${head}[{"number":7}]`, 0, {
      coloured: `${head}\u001b[1;38m[\u001b[m{\u001b[1;34m"number"\u001b[m:7}\u001b[1;38m]\u001b[m`,
    });

    // No `env` option: the runner reads the process's own, where both are set.
    vi.stubEnv("PATH", bin);
    vi.stubEnv("CLICOLOR_FORCE", "1");
    vi.stubEnv("GH_FORCE_TTY", "1");
    let response: unknown;
    try {
      response = await ghApi({ method: "GET", path: "repos/acme/app/pulls", hostname: HOST }, { cwd: work });
    } finally {
      vi.unstubAllEnvs();
    }

    expect(response).toEqual({ status: 200, json: [{ number: 7 }] });
    expect(await readFile(envLog, "utf8")).toBe("NO_COLOR=1\nCLICOLOR_FORCE=\nGH_FORCE_TTY=\n");
  });

  it.skipIf(process.platform === "win32")("rejects, and throws nothing uncaught, when gh exits before reading a large body", async () => {
    const { bin, work } = await standIn("", 4, { readsStdin: false });
    const body = { body: "x".repeat(4 * 1024 * 1024) };

    await expect(
      ghApi({ method: "POST", path: "repos/acme/app/pulls", body, hostname: HOST }, { cwd: work, env: { PATH: bin } }),
    ).rejects.toThrow(/no HTTP status/);
  });

  it.skipIf(process.platform === "win32")("rejects when gh printed no HTTP head", async () => {
    const { bin, work } = await standIn("", 4);

    await expect(ghApi({ method: "GET", path: "repos/acme/app", hostname: HOST }, { cwd: work, env: { PATH: bin } })).rejects.toThrow(
      /no HTTP status/,
    );
  });
});
