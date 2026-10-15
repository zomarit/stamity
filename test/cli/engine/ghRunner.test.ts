import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ghApi, ghApiArgs, parseGhInclude, type GhRequest } from "../../../src/cli/engine/ghRunner.ts";
import { useTempDir } from "../../support/tempDir.ts";

/**
 * The `gh api` door: the argument vector, the closed method and path sets
 * (refused before `gh` starts), the status read from `--include`'s head, and
 * the start itself through a stand-in `gh` on `PATH`.
 */

describe("ghApiArgs", () => {
  it("builds api --include --method <M> <path>, with --input - only for a body", () => {
    expect(ghApiArgs({ method: "GET", path: "/repos/acme/app/pulls?head=acme%3Ax&state=open" })).toEqual([
      "api",
      "--include",
      "--method",
      "GET",
      "repos/acme/app/pulls?head=acme%3Ax&state=open",
    ]);
    expect(ghApiArgs({ method: "POST", path: "repos/acme/app/pulls", body: { draft: true } })).toEqual([
      "api",
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
      { method: "POST", path: "repos/acme/app/pulls", body: {} },
      { method: "PATCH", path: "repos/acme/app/pulls/7", body: {} },
      { method: "POST", path: "repos/acme/app/issues/7/comments", body: {} },
      { method: "POST", path: "repos/acme/app/pulls/7/comments", body: {} },
    ] as const) {
      expect(() => ghApiArgs(request), request.path).not.toThrow();
    }
  });

  it("refuses a method outside GET, POST and PATCH, graphql, a flag-shaped path and every other write", () => {
    const refused: GhRequest[] = [
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
    ];
    for (const request of refused) {
      expect(() => ghApiArgs(request), `${request.method} ${request.path}`).toThrow(/gh api:/);
    }
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

    await expect(ghApi({ method: "POST", path: "graphql", body: {} }, { cwd: empty, env: { PATH: empty } })).rejects.toMatchObject({
      code: "GH_REFUSED",
    });
    await expect(ghApi({ method: "GET", path: "repos/acme/app" }, { cwd: empty, env: { PATH: empty } })).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  // The stand-in takes gh's place on PATH. Mock reason: the real gh calls
  // GitHub's network under the operator's login, which no test may do. It logs
  // its arguments, its stdin and one variable, then prints a canned
  // `--include` answer. Windows starts no shebang script, so these cases run on
  // POSIX hosts; the argument vector itself is proven on every host above.
  async function standIn(answer: string, exitCode: number): Promise<{ bin: string; work: string; log: string; input: string }> {
    const bin = getRoot().path("bin");
    const work = getRoot().path("work");
    const log = getRoot().path("argv.log");
    const input = getRoot().path("stdin.log");
    const canned = getRoot().path("answer.txt");
    await mkdir(bin);
    await mkdir(work);
    await writeFile(canned, answer, "utf8");
    await writeFile(
      join(bin, "gh"),
      `#!/bin/sh\nprintf '%s\\n' "$@" "prompt=$GH_PROMPT_DISABLED" > '${log}'\n/bin/cat > '${input}'\n/bin/cat '${canned}'\nexit ${exitCode}\n`,
      "utf8",
    );
    await chmod(join(bin, "gh"), 0o755);
    return { bin, work, log, input };
  }

  it.skipIf(process.platform === "win32")("starts gh with the argument vector, hands the body on stdin and reads the status", async () => {
    const { bin, work, log, input } = await standIn('HTTP/2.0 201 Created\r\nContent-Type: application/json\r\n\r\n{"number":12}', 0);

    const response = await ghApi(
      { method: "POST", path: "/repos/acme/app/pulls", body: { title: "t", draft: true } },
      { cwd: work, env: { PATH: bin } },
    );

    expect(response).toEqual({ status: 201, json: { number: 12 } });
    expect(await readFile(log, "utf8")).toBe("api\n--include\n--method\nPOST\n--input\n-\nrepos/acme/app/pulls\nprompt=1\n");
    expect(JSON.parse(await readFile(input, "utf8"))).toEqual({ title: "t", draft: true });
  });

  it.skipIf(process.platform === "win32")("resolves a 4xx answer gh exits 1 on as its status", async () => {
    const { bin, work } = await standIn('HTTP/2.0 422 Unprocessable Entity\r\n\r\n{"message":"Validation Failed"}', 1);

    await expect(ghApi({ method: "POST", path: "repos/acme/app/pulls", body: {} }, { cwd: work, env: { PATH: bin } })).resolves.toEqual({
      status: 422,
      json: { message: "Validation Failed" },
    });
  });

  it.skipIf(process.platform === "win32")("rejects when gh printed no HTTP head", async () => {
    const { bin, work } = await standIn("", 4);

    await expect(ghApi({ method: "GET", path: "repos/acme/app" }, { cwd: work, env: { PATH: bin } })).rejects.toThrow(/no HTTP status/);
  });
});
