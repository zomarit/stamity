import { describe, expect, it } from "vitest";
import { classifyFailure } from "../../src/resilience/failureClass.ts";
import { EngineError } from "../../src/types/errors.ts";

/** An OS-shaped error: a plain `Error` carrying an errno string on `code`. */
function errnoError(code: string, message = "operation failed"): Error {
  return Object.assign(new Error(message), { code });
}

describe("classifyFailure — errno codes", () => {
  it.each([
    "ECONNREFUSED",
    "ECONNRESET",
    "ETIMEDOUT",
    "ENOTFOUND",
    "EAI_AGAIN",
    "EPIPE",
    "EHOSTUNREACH",
  ])("treats the connectivity code %s as transient", (code) => {
    expect(classifyFailure(errnoError(code))).toBe("transient");
  });

  it.each(["EBUSY", "EAGAIN", "EMFILE", "ENFILE", "ENOENT"])(
    "treats the contention code %s as transient",
    (code) => {
      expect(classifyFailure(errnoError(code))).toBe("transient");
    },
  );

  it.each(["EACCES", "EPERM", "EROFS", "ENOSPC", "EEXIST", "EISDIR", "ENOTDIR"])(
    "treats the settled filesystem code %s as substantive",
    (code) => {
      expect(classifyFailure(errnoError(code))).toBe("substantive");
    },
  );

  it("leaves an unrecognised errno unknown rather than guessing", () => {
    expect(classifyFailure(errnoError("EWEIRD"))).toBe("unknown");
  });
});

describe("classifyFailure — engine error codes", () => {
  it("classifies a VALIDATION_ERROR as substantive", () => {
    const error = new EngineError("frontmatter is missing an id", { code: "VALIDATION_ERROR" });
    expect(classifyFailure(error)).toBe("substantive");
  });

  it.each(["CONFIG_ERROR", "INTEGRITY_ERROR"] as const)(
    "classifies %s as substantive",
    (code) => {
      expect(classifyFailure(new EngineError("settled by its input", { code }))).toBe(
        "substantive",
      );
    },
  );

  it.each(["NETWORK_ERROR", "LOCK_TIMEOUT"] as const)("classifies %s as transient", (code) => {
    expect(classifyFailure(new EngineError("temporary failure", { code }))).toBe("transient");
  });

  it.each(["ADAPTER_ERROR", "FS_ERROR", "CLEAN_ERROR", "UNKNOWN_ERROR"] as const)(
    "leaves the wrapper code %s unknown when it carries no cause",
    (code) => {
      expect(classifyFailure(new EngineError("wrapped something", { code }))).toBe("unknown");
    },
  );
});

describe("classifyFailure — cancellation and logic errors", () => {
  it("classifies an AbortController reason as substantive", () => {
    const controller = new AbortController();
    controller.abort();
    expect(classifyFailure(controller.signal.reason)).toBe("substantive");
  });

  it("classifies an AbortError-named plain error as substantive", () => {
    expect(classifyFailure(Object.assign(new Error("cancelled"), { name: "AbortError" }))).toBe(
      "substantive",
    );
  });

  it("classifies the ABORT_ERR code as substantive", () => {
    expect(classifyFailure(errnoError("ABORT_ERR", "aborted"))).toBe("substantive");
  });

  it("keeps a cancel substantive even when its message mentions a timeout", () => {
    // Cancellation is checked before the timeout heuristic on purpose: the abort
    // reason's own wording must not re-open a retry loop the caller cancelled.
    const aborted = new DOMException("The operation was aborted due to timeout", "AbortError");
    expect(classifyFailure(aborted)).toBe("substantive");
  });

  it("classifies an elapsed deadline (TimeoutError) as transient", () => {
    const timedOut = new DOMException("The operation was aborted due to timeout", "TimeoutError");
    expect(classifyFailure(timedOut)).toBe("transient");
  });

  it.each([new TypeError("x is not a function"), new SyntaxError("Unexpected token }")])(
    "classifies the programming error %s as substantive",
    (error) => {
      expect(classifyFailure(error)).toBe("substantive");
    },
  );
});

describe("classifyFailure — message heuristics", () => {
  it.each([
    "503 Service Unavailable",
    "429 Too Many Requests",
    "Gateway Timeout",
    "socket hang up",
    "request timed out after 30s",
  ])("reads %s as transient", (message) => {
    expect(classifyFailure(new Error(message))).toBe("transient");
  });

  it.each([
    "404 Not Found",
    "401 Unauthorized",
    "malformed manifest",
    "missing required field: tools",
  ])("reads %s as substantive", (message) => {
    expect(classifyFailure(new Error(message))).toBe("substantive");
  });

  it("prefers the code over the message when both are present", () => {
    // A DNS failure literally reads "getaddrinfo ENOTFOUND"; the code decides.
    expect(classifyFailure(errnoError("ENOTFOUND", "getaddrinfo ENOTFOUND registry.local"))).toBe(
      "transient",
    );
  });
});

describe("classifyFailure — cause chains", () => {
  it("classifies a wrapper by the errno it wraps", () => {
    const wrapped = new EngineError("could not write the manifest", {
      code: "FS_ERROR",
      cause: errnoError("EBUSY", "resource busy"),
    });
    expect(classifyFailure(wrapped)).toBe("transient");
  });

  it("stops at the first link that yields a verdict", () => {
    const wrapped = new EngineError("config is invalid", {
      code: "CONFIG_ERROR",
      cause: errnoError("ECONNRESET"),
    });
    expect(classifyFailure(wrapped)).toBe("substantive");
  });

  it("walks past several unclassifiable links", () => {
    const deep = new Error("outer", {
      cause: new Error("middle", { cause: errnoError("ETIMEDOUT") }),
    });
    expect(classifyFailure(deep)).toBe("transient");
  });

  it("gives up beyond the depth bound instead of walking forever", () => {
    let chain = errnoError("EBUSY");
    for (let i = 0; i < 6; i += 1) chain = new Error(`layer ${i}`, { cause: chain });
    expect(classifyFailure(chain)).toBe("unknown");
  });

  it("terminates on a self-referential cause", () => {
    const cyclic: Error & { cause?: unknown } = new Error("loops back");
    cyclic.cause = cyclic;
    expect(classifyFailure(cyclic)).toBe("unknown");
  });
});

describe("classifyFailure — non-error values", () => {
  it.each([["a thrown string", "boom"], ["null", null], ["undefined", undefined], ["a number", 42]])(
    "classifies %s as unknown",
    (_label, value) => {
      expect(classifyFailure(value)).toBe("unknown");
    },
  );

  it("classifies a bare object as unknown", () => {
    expect(classifyFailure({})).toBe("unknown");
  });

  it("still classifies an error-shaped plain object", () => {
    expect(classifyFailure({ code: "ECONNRESET", message: "socket closed" })).toBe("transient");
  });

  it("ignores a non-string code", () => {
    // A DOMException carries a legacy numeric `code`; only `name` should decide.
    expect(classifyFailure({ code: 20, message: "nothing recognisable" })).toBe("unknown");
  });
});
