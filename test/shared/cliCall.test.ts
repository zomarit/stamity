import { describe, expect, it } from "vitest";
import { CANONICAL_PACKAGE_NAME } from "../../src/cli/kit/packageName.ts";
import {
  DEFAULT_CLI_PACKAGE_NAME,
  pinnedCliCall,
  pinnedCliPrefix,
} from "../../src/shared/cliCall.ts";
import { EngineError } from "../../src/types/errors.ts";

/**
 * The pinned CLI call (REQ-FLOW-002): the one spelling every emitted body, hook
 * hint and remedy uses to run this package — `npx -y <package>@<version> <verb>`.
 * Never a bare `stamity` (only a global install provides it) and never
 * `@latest` (a body generated at one version would run another).
 */

/** Asserts `run` throws an `EngineError` carrying `VALIDATION_ERROR`, and returns its message. */
function validationMessage(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(EngineError);
    expect((error as EngineError).code).toBe("VALIDATION_ERROR");
    return (error as EngineError).message;
  }
  throw new Error("expected a VALIDATION_ERROR, and nothing was thrown");
}

describe("pinnedCliCall", () => {
  it("renders the pinned npx call for a verb", () => {
    expect(pinnedCliCall("@zomarit/stamity", "1.11.0", "check")).toBe(
      "npx -y @zomarit/stamity@1.11.0 check",
    );
  });

  it("passes a multi-word verb through as the whole tail", () => {
    expect(pinnedCliCall("@zomarit/stamity", "1.0.0-golden", "learn capture")).toBe(
      "npx -y @zomarit/stamity@1.0.0-golden learn capture",
    );
  });

  it("names a fork's own package, so a renamed downstream never runs the canonical one", () => {
    expect(pinnedCliCall("@acme/stamity", "2.3.4", "sync")).toBe("npx -y @acme/stamity@2.3.4 sync");
    expect(pinnedCliCall("stamity-internal", "2.3.4", "sync")).toBe(
      "npx -y stamity-internal@2.3.4 sync",
    );
  });

  it("refuses `latest` and an empty version rather than rendering an unpinned call", () => {
    for (const version of ["", "latest", "  "]) {
      expect(validationMessage(() => pinnedCliCall("@zomarit/stamity", version, "check"))).toMatch(
        /semver/,
      );
    }
  });
});

describe("pinnedCliPrefix", () => {
  it("renders the call without a verb — the value the substitution token carries", () => {
    expect(pinnedCliPrefix("@zomarit/stamity", "1.11.0")).toBe("npx -y @zomarit/stamity@1.11.0");
    expect(`${pinnedCliPrefix("@zomarit/stamity", "1.11.0")} check`).toBe(
      pinnedCliCall("@zomarit/stamity", "1.11.0", "check"),
    );
  });

  it("accepts a prerelease and build metadata, the semver shapes a package version takes", () => {
    expect(pinnedCliPrefix("@zomarit/stamity", "1.11.0-rc.1")).toBe(
      "npx -y @zomarit/stamity@1.11.0-rc.1",
    );
    expect(pinnedCliPrefix("@zomarit/stamity", "1.11.0+sha.5114f85")).toBe(
      "npx -y @zomarit/stamity@1.11.0+sha.5114f85",
    );
  });

  it("refuses a version that is not semver-shaped", () => {
    for (const version of ["1", "1.2", "v1.2.3", "^1.2.3", "1.2.3 && echo", "1.2.3\n", "01.2.3x"]) {
      expect(validationMessage(() => pinnedCliPrefix("@zomarit/stamity", version)), version).toMatch(
        /semver/,
      );
    }
  });

  it("refuses an empty package name, and one that is not a runnable npm package name", () => {
    // The name lands in a shell command in every emitted body: a leading `-`
    // would read as an npx flag, and whitespace or a metacharacter would split
    // or extend the command.
    for (const name of ["", " ", "-y", "@zomarit/", "/stamity", "a b", "pkg;rm", "Stamity", "@scope/a/b"]) {
      expect(validationMessage(() => pinnedCliPrefix(name, "1.0.0")), JSON.stringify(name)).toMatch(
        /package name/,
      );
    }
  });
});

describe("DEFAULT_CLI_PACKAGE_NAME", () => {
  it("is the canonical build's published name, the kit's own fallback", () => {
    // A literal twin rather than an import: the kit sits at wave 13 and this
    // kernel at wave 1, so the value is restated here and held equal by test.
    expect(DEFAULT_CLI_PACKAGE_NAME).toBe(CANONICAL_PACKAGE_NAME);
    expect(pinnedCliPrefix(DEFAULT_CLI_PACKAGE_NAME, "1.11.0")).toBe("npx -y @zomarit/stamity@1.11.0");
  });
});
