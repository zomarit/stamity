import { describe, expect, it } from "vitest";
import type { CommandModule } from "../../src/cli/kit/program.ts";
import { EngineError, type ErrorCode } from "../../src/types/errors.ts";
import { runInProcess } from "../support/inProcess.ts";

/**
 * Exhaustive expectation, typed against the union: adding or removing an
 * ErrorCode member without updating this fixture is a compile error.
 */
const CODE_NOTES: Record<ErrorCode, string> = {
  VALIDATION_ERROR: "project content or config is structurally invalid",
  CONFIG_ERROR: "malformed input data",
  ADAPTER_ERROR: "a target-tool adapter failed",
  UNKNOWN_ERROR: "internal software error",
  INTEGRITY_ERROR: "output cannot be regenerated to match its source",
  FS_ERROR: "an I/O failure",
  CLEAN_ERROR: "an I/O failure during clean",
  NETWORK_ERROR: "a transient network failure",
  LOCK_TIMEOUT: "a transient lock failure",
};

const ALL_CODES = Object.keys(CODE_NOTES) as ErrorCode[];

describe("the classification channel is `code`, not the exit number", () => {
  it("keeps all 9 codes as the thing a caller branches on", () => {
    expect(ALL_CODES).toHaveLength(9);
    for (const code of ALL_CODES) {
      expect(new EngineError("boom", { code }).code).toBe(code);
    }
  });

  it("gives every failure the same process status, whatever kind it is", () => {
    // The sysexits translation is retired: the CLI collapses failures to
    // 1 and carries the kind in `error.code`. A per-code exit number survived
    // as exported public API and as a published nine-row column telling CI
    // authors to branch on 64/65/73 — statuses this binary never returns.
    for (const code of ALL_CODES) {
      expect(new EngineError("boom", { code }).exitCode).toBe(1);
    }
  });

  it("exports no exit-code map or translator", async () => {
    const errors = await import("../../src/types/errors.ts");
    const publicApi = await import("../../src/index.ts");
    for (const removed of ["ERROR_CODE_TO_EXIT_CODE", "exitCodeFor"]) {
      expect(Object.keys(errors), removed).not.toContain(removed);
      expect(Object.keys(publicApi), removed).not.toContain(removed);
    }
  });
});

describe("EngineError", () => {
  it("defaults exitCode to the one failure status the CLI produces", () => {
    for (const code of ALL_CODES) {
      expect(new EngineError("boom", { code }).exitCode).toBe(1);
    }
  });

  it("lets an explicit exitCode win over the derived one", () => {
    const err = new EngineError("boom", { code: "CONFIG_ERROR", exitCode: 7 });
    expect(err.exitCode).toBe(7);
  });

  it("lets an explicit exitCode of 0 win (clean user cancel; guards ?? vs ||)", () => {
    const err = new EngineError("cancelled", { code: "VALIDATION_ERROR", exitCode: 0 });
    expect(err.exitCode).toBe(0);
  });

  it("carries the optional why/next lines of the failure document", () => {
    // The published error schema promises `why` and `next`, and until
    // these fields existed only a CliFailure thrown at the CLI edge could carry
    // them — every engine failure, which is nearly all of them, arrived with a
    // message alone while the reference page described a richer document.
    const err = new EngineError("pack install refused", {
      code: "VALIDATION_ERROR",
      why: "the pack's content hash does not match its catalog pin",
      next: "re-run `stamity add ops` to fetch the pinned content again",
    });

    expect(err.why).toBe("the pack's content hash does not match its catalog pin");
    expect(err.next).toBe("re-run `stamity add ops` to fetch the pinned content again");
  });

  it("leaves no own why/next property when a throw site states neither", () => {
    // Same rule the `cause` case above holds to: an own `why: undefined` would
    // serialize as a field the failure claims to carry, and a fabricated next
    // step is worse than an absent one.
    const bare = new EngineError("boom", { code: "FS_ERROR" });
    const explicitlyUndefined = new EngineError("boom", {
      code: "FS_ERROR",
      why: undefined,
      next: undefined,
    });

    for (const err of [bare, explicitlyUndefined]) {
      expect(Object.hasOwn(err, "why")).toBe(false);
      expect(Object.hasOwn(err, "next")).toBe(false);
      expect(err.why).toBeUndefined();
      expect(err.next).toBeUndefined();
    }
  });

  it("is a real Error with a stable name, message, and readonly code", () => {
    const err = new EngineError("bad manifest", { code: "CONFIG_ERROR" });
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(EngineError);
    expect(err.name).toBe("EngineError");
    expect(err.message).toBe("bad manifest");
    expect(err.code).toBe("CONFIG_ERROR");
  });

  it("preserves a provided cause on the native Error field", () => {
    const inner = new Error("disk full");
    const err = new EngineError("write failed", { code: "FS_ERROR", cause: inner });
    expect(err.cause).toBe(inner);
  });

  it("leaves no own cause property when cause is absent or explicitly undefined", () => {
    // Serializers walking the cause chain must see only real links, never a
    // phantom own `cause: undefined`.
    const withoutCause = new EngineError("boom", { code: "UNKNOWN_ERROR" });
    const undefinedCause = new EngineError("boom", {
      code: "UNKNOWN_ERROR",
      cause: undefined,
    });
    expect(Object.hasOwn(withoutCause, "cause")).toBe(false);
    expect(Object.hasOwn(undefinedCause, "cause")).toBe(false);
  });
});

/**
 * The reader half of this module's contract.
 *
 * `src/types/errors.ts` states that `exitCode` is the process status the CLI
 * funnel reads and that `why`/`next` reach the failure document. Both were
 * claims about a consumer, and one of them was false: the funnel collapsed
 * every throw to status 1, so a clean-cancel throw would still have reported a
 * failure, and it dropped `why`/`next` while the published schema promised
 * them. These cases drive the real funnel, so the claims cannot drift apart
 * from the code again without going red here.
 */
function throwingCommand(build: () => Error): CommandModule {
  return {
    name: "boom",
    summary: "throws on demand",
    mutating: false,
    run: () => {
      throw build();
    },
  };
}

function parseSingleDoc(stdout: string): Record<string, unknown> {
  const lines = stdout.split("\n").filter((line) => line !== "");
  expect(lines).toHaveLength(1);
  return JSON.parse(lines[0] ?? "") as Record<string, unknown>;
}

const withLines = (): EngineError =>
  new EngineError("pack install refused", {
    code: "VALIDATION_ERROR",
    why: "the pack's content hash does not match its catalog pin",
    next: "re-run `stamity add ops` to fetch the pinned content again",
  });

/** A failure that knows neither its cause nor a next step — the common case. */
const bare = (): EngineError => new EngineError("disk full", { code: "FS_ERROR" });

/** The one non-failure throw: a clean user cancel, declared with exitCode 0. */
const cancel = (): EngineError =>
  new EngineError("cancelled at your request", { code: "VALIDATION_ERROR", exitCode: 0 });

describe("the CLI funnel reads these fields", () => {
  it("renders why and next in human mode when the failure carries them", async () => {
    const result = await runInProcess([throwingCommand(withLines)], ["boom"]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("error: pack install refused");
    expect(result.stderr).toContain("why: the pack's content hash does not match its catalog pin");
    expect(result.stderr).toContain("next: re-run `stamity add ops`");
  });

  it("carries why and next in the JSON error object", async () => {
    const result = await runInProcess([throwingCommand(withLines)], ["boom", "--json"]);

    expect(result.code).toBe(1);
    const error = parseSingleDoc(result.stdout)["error"] as Record<string, unknown>;
    expect(error["code"]).toBe("VALIDATION_ERROR");
    expect(error["message"]).toBe("pack install refused");
    expect(error["why"]).toBe("the pack's content hash does not match its catalog pin");
    expect(error["next"]).toBe("re-run `stamity add ops` to fetch the pinned content again");
  });

  it("renders neither line, and emits neither key, when the failure carries neither", async () => {
    // The other side of the honesty rule the generated page now states: the
    // two fields are optional, and a failure without them produces a document
    // without them rather than empty strings a parser would have to guess at.
    const human = await runInProcess([throwingCommand(bare)], ["boom"]);
    expect(human.stderr).toContain("error: disk full");
    expect(human.stderr).not.toContain("why:");
    expect(human.stderr).not.toContain("next:");

    const json = await runInProcess([throwingCommand(bare)], ["boom", "--json"]);
    const error = parseSingleDoc(json.stdout)["error"] as Record<string, unknown>;
    expect(Object.hasOwn(error, "why")).toBe(false);
    expect(Object.hasOwn(error, "next")).toBe(false);
  });

  it("ends the run at status 0 for a throw declaring exitCode 0, with ok true", async () => {
    // The field's own doc named the funnel as its consumer, and the
    // funnel ignored it — so a clean user cancel would have exited 1. It leaves
    // through the success lane now, which is what keeps the status and `ok`
    // from disagreeing about whether a cancel is a fault.
    const human = await runInProcess([throwingCommand(cancel)], ["boom"]);
    expect(human.code).toBe(0);
    expect(human.stderr).toContain("cancelled at your request");
    expect(human.stderr).not.toContain("error:");

    const json = await runInProcess([throwingCommand(cancel)], ["boom", "--json"]);
    expect(json.code).toBe(0);
    const doc = parseSingleDoc(json.stdout);
    expect(doc["ok"]).toBe(true);
    expect(doc["cancelled"]).toBe(true);
    expect(doc["reason"]).toBe("cancelled at your request");
    expect(doc["error"]).toBeUndefined();
  });

  it("still collapses an ordinary engine failure to status 1", async () => {
    // The edge the new branch must not widen: adding optional fields and one
    // exitCode reader changes no existing exit code.
    const results = await Promise.all(
      ALL_CODES.map(async (code) => ({
        code,
        run: await runInProcess(
          [throwingCommand(() => new EngineError("boom", { code }))],
          ["boom"],
        ),
      })),
    );
    for (const { code, run } of results) expect(run.code, code).toBe(1);
  });
});

/**
 * The other half of the funnel's document contract, filed beside the cases
 * above for the same reason they are here: this is where `runCli` is driven
 * end to end through a fixture command, and the guarantee is about the
 * document a failure produces.
 *
 * A command that returns `exitCode: 1` describes its own failure, so the funnel
 * wraps its payload as THE `ok: false` document rather than stacking an error
 * envelope on it. The payload was spread AFTER the envelope keys, which meant a
 * payload field named `ok`, `command` or `version` overwrote the envelope — and
 * `ok` is a field real payloads carry (`stamity check` publishes its own). A
 * failing command could therefore publish `ok: true` beside exit 1, which is
 * the exact disagreement the envelope exists to prevent.
 */
describe("the funnel's exit-1 envelope", () => {
  const spoofing: CommandModule = {
    name: "spoof",
    summary: "returns a failing result whose payload collides with the envelope",
    mutating: false,
    run: async () => ({
      exitCode: 1,
      json: {
        ok: true,
        command: "something-else",
        version: "9.9.9",
        error: { code: "VALIDATION_ERROR" as const, message: "the real failure" },
        detail: "payload fields that do not collide survive",
      },
    }),
  };

  it("keeps its own ok, command and version whatever the payload names them", async () => {
    const result = await runInProcess([spoofing], ["spoof", "--json"]);

    expect(result.code).toBe(1);
    const doc = parseSingleDoc(result.stdout);
    expect(doc["ok"]).toBe(false);
    expect(doc["command"]).toBe("spoof");
    expect(doc["version"]).not.toBe("9.9.9");
    // And the payload is still delivered: the fix is an ordering change, not a
    // filter — nothing a command returns is dropped.
    expect(doc["detail"]).toBe("payload fields that do not collide survive");
    expect(doc["error"]).toEqual({ code: "VALIDATION_ERROR", message: "the real failure" });
  });
});
