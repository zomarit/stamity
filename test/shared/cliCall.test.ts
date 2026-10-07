import { describe, expect, it } from "vitest";
import { CANONICAL_PACKAGE_NAME } from "../../src/cli/kit/packageName.ts";
import {
  cliCallHint,
  DEFAULT_CLI_PACKAGE_NAME,
  pinnedCliCall,
  pinnedCliPrefix,
  REGISTRY_URL,
  scopeRegistryArg,
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

/**
 * The npm-channel option (security review/94, fail closed): a package no
 * registry serves renders `npx --no`, which runs a copy the project already
 * has installed and refuses to fetch one. Absent or `true` keeps `-y`, so
 * every caller that names no option renders what it always did.
 */
describe("the npm-channel option", () => {
  it("renders `--no` for a package with no npm channel, on every entry point", () => {
    const noChannel = { npmChannel: false };
    expect(pinnedCliPrefix("@acme/stamity", "1.8.0", noChannel)).toBe("npx --no @acme/stamity@1.8.0");
    expect(pinnedCliCall("@acme/stamity", "1.8.0", "sync", noChannel)).toBe(
      "npx --no @acme/stamity@1.8.0 sync",
    );
    expect(cliCallHint("@acme/stamity", "1.8.0", "check", noChannel)).toBe(
      "`stamity check` where the CLI is installed, else `npx --no @acme/stamity@1.8.0 check`",
    );
  });

  it("keeps `-y` when the option is absent or names a channel", () => {
    expect(pinnedCliCall("@acme/stamity", "1.8.0", "sync")).toBe("npx -y @acme/stamity@1.8.0 sync");
    expect(pinnedCliCall("@acme/stamity", "1.8.0", "sync", {})).toBe("npx -y @acme/stamity@1.8.0 sync");
    expect(pinnedCliCall("@acme/stamity", "1.8.0", "sync", { npmChannel: true })).toBe(
      "npx -y @acme/stamity@1.8.0 sync",
    );
  });

  it("validates the name and version the same way under `--no`", () => {
    expect(validationMessage(() => pinnedCliPrefix("@acme/stamity", "latest", { npmChannel: false }))).toMatch(
      /semver/,
    );
    expect(
      validationMessage(() => pinnedCliPrefix("-acme", "1.8.0", { npmChannel: false })),
    ).toMatch(/runnable npm package name/);
  });
});

/**
 * The scope registry (REQ-PLUGIN-048): a fork made with `fork-identity.mjs
 * --registry` publishes `@<scope>/stamity` to its own registry, and npx finds a
 * scope's registry only in npm's configuration. So the call names it ahead of
 * the package spec — `--@<scope>:registry=<url>` — and npm takes the fork's
 * package from the fork's registry and every other package from the default
 * one. A value outside a plain https grammar is never written into a command.
 */
describe("the scope-registry option", () => {
  const REGISTRY = "https://npm.pkg.github.com";

  it("names the scope's registry between the npx flag and the package spec", () => {
    expect(pinnedCliPrefix("@acme/stamity", "1.12.0-acme.1", { registry: REGISTRY })).toBe(
      "npx -y --@acme:registry=https://npm.pkg.github.com @acme/stamity@1.12.0-acme.1",
    );
    expect(pinnedCliPrefix("@acme/stamity", "1.12.0-acme.1", { registry: REGISTRY, npmChannel: false })).toBe(
      "npx --no --@acme:registry=https://npm.pkg.github.com @acme/stamity@1.12.0-acme.1",
    );
    expect(pinnedCliCall("@acme/stamity", "1.12.0", "learn capture", { registry: REGISTRY })).toBe(
      "npx -y --@acme:registry=https://npm.pkg.github.com @acme/stamity@1.12.0 learn capture",
    );
    expect(cliCallHint("@acme/stamity", "1.12.0", "check", { registry: REGISTRY })).toBe(
      "`stamity check` where the CLI is installed, else " +
        "`npx -y --@acme:registry=https://npm.pkg.github.com @acme/stamity@1.12.0 check`",
    );
  });

  it("renders a registry as recorded, a path and a trailing slash included", () => {
    expect(pinnedCliPrefix("@acme/stamity", "1.0.0", { registry: "https://npm.acme.example/" })).toBe(
      "npx -y --@acme:registry=https://npm.acme.example/ @acme/stamity@1.0.0",
    );
    expect(
      pinnedCliPrefix("@acme/stamity", "1.0.0", { registry: "https://r.acme.example:8443/npm/v1_x-y~z/" }),
    ).toBe("npx -y --@acme:registry=https://r.acme.example:8443/npm/v1_x-y~z/ @acme/stamity@1.0.0");
  });

  it("renders today's call byte for byte when no registry is named", () => {
    expect(pinnedCliPrefix("@acme/stamity", "1.12.0", {})).toBe("npx -y @acme/stamity@1.12.0");
    expect(pinnedCliPrefix("@zomarit/stamity", "1.11.0", { npmChannel: true })).toBe(
      "npx -y @zomarit/stamity@1.11.0",
    );
    expect(scopeRegistryArg("@acme/stamity", undefined)).toBe("");
  });

  it("refuses a registry for an unscoped package: only `--registry` could carry it, and it moves every dependency", () => {
    expect(validationMessage(() => pinnedCliPrefix("stamity-internal", "1.0.0", { registry: REGISTRY }))).toMatch(
      /unscoped package cannot name a scope registry/,
    );
    expect(validationMessage(() => scopeRegistryArg("stamity", REGISTRY))).toMatch(/unscoped/);
  });

  it("refuses a registry outside the plain https grammar, never echoing it into a command", () => {
    for (const registry of [
      "http://r.example",
      "https://u:p@r.example",
      "https://r.example/?t=1",
      "https://r.example/#x",
      "https://r.example/a%20b",
      "https://r.example/$x",
      "https://r.example/a b",
      'https://r.example/"x',
      "https://r.example/'x",
      "https://r.example/`id`",
      "https://r.example/^x",
      "https://r.example/a;b",
      "https://r.example/a&b",
      "https://r.example\n",
      "",
      "https://",
    ]) {
      const message = validationMessage(() => pinnedCliPrefix("@acme/stamity", "1.0.0", { registry }));
      expect(message, JSON.stringify(registry)).toMatch(/is not a plain https URL/);
      // The refused value may carry credentials, so the message names the rule, not the value
      // (as `scripts/fork-identity.mjs` never echoes a URL it refused).
      if (registry.length > "https://".length) expect(message, JSON.stringify(registry)).not.toContain(registry);
      expect(REGISTRY_URL.test(registry), JSON.stringify(registry)).toBe(false);
    }
    expect(REGISTRY_URL.test(REGISTRY)).toBe(true);
  });
});
