import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { delimiter, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { tempRoots, trustedGh } from "../../../src/cli/engine/ghTrust.ts";
import { insideAny, type PlaceReads } from "../../../src/runs/landEvidence.ts";

/**
 * Where `gh` may not lie, read with `TMPDIR` pointing elsewhere: `os.tmpdir()` follows that variable, so the
 * temp folders a platform always has are named apart from it. A child a test spawns with a bare environment
 * has no `TMPDIR` at all, and on macOS `os.tmpdir()` then answers `/tmp`, not the user's own temp folder.
 */

const MOVED = "/opt/moved-tmp";

afterEach(() => vi.unstubAllEnvs());

/** macOS's links: `/tmp` and `/var` are links into `/private`. Mock reason: each platform's shape is proven on any host. */
const darwinReads: PlaceReads = {
  platform: "darwin",
  realpath: (path) => (/^\/(tmp|var)(\/|$)/.test(path) ? `/private${path}` : path),
};
const linuxReads: PlaceReads = { platform: "linux", realpath: (path) => path };

describe("tempRoots, with TMPDIR moved away", () => {
  it.each([
    ["the user's temp folder, as the link spells it", "/var/folders/ab/cdef/T/planted/gh"],
    ["the user's temp folder, as its real path", "/private/var/folders/ab/cdef/T/planted/gh"],
    ["the user's cache folder beside it", "/var/folders/ab/cdef/C/planted/gh"],
    ["/var/tmp", "/var/tmp/planted/gh"],
    ["/var/tmp's real path", "/private/var/tmp/planted/gh"],
    ["/tmp", "/tmp/planted/gh"],
    ["/tmp's real path", "/private/tmp/planted/gh"],
  ])("reads a macOS path in %s as inside", (_where, path) => {
    vi.stubEnv("TMPDIR", MOVED);
    expect(insideAny(path, tempRoots({}, "darwin"), darwinReads)).toBe(true);
  });

  it.each([
    ["/tmp", "/tmp/planted/gh"],
    ["/var/tmp", "/var/tmp/planted/gh"],
  ])("reads a Linux path in %s as inside", (_where, path) => {
    vi.stubEnv("TMPDIR", MOVED);
    expect(insideAny(path, tempRoots({}, "linux"), linuxReads)).toBe(true);
  });

  it.each([
    ["Homebrew's bin", "/opt/homebrew/bin/gh"],
    ["/usr/local/bin", "/usr/local/bin/gh"],
    ["a sibling that only shares the root's prefix", "/var/folders-kept/gh"],
  ])("leaves a macOS path in %s outside", (_where, path) => {
    vi.stubEnv("TMPDIR", MOVED);
    expect(insideAny(path, tempRoots({}, "darwin"), darwinReads)).toBe(false);
  });

  it.each([
    ["/usr/bin", "/usr/bin/gh"],
    // The nightly's release prep starts its stub from here, so this place has to stay accepted.
    ["a runner's RUNNER_TEMP", "/home/runner/work/_temp/release-prep/bin/gh"],
  ])("leaves a Linux path in %s outside", (_where, path) => {
    vi.stubEnv("TMPDIR", MOVED);
    expect(insideAny(path, tempRoots({}, "linux"), linuxReads)).toBe(false);
  });
});

/** The temp folders this host has, on its own path shape, whatever `TMPDIR` says. */
function hostTempFolders(): [string, string][] {
  const shared: [string, string][] = [
    ["/tmp", "/tmp"],
    ["/var/tmp", "/var/tmp"],
  ];
  if (process.platform !== "darwin") return shared;
  return [["the user's temp folder", execFileSync("/usr/bin/getconf", ["DARWIN_USER_TEMP_DIR"], { encoding: "utf8" }).trim()], ...shared];
}

describe.skipIf(process.platform === "win32")("trustedGh on this host, with TMPDIR moved away", () => {
  it.each(hostTempFolders())("refuses a real gh in %s", (_where, base) => {
    vi.stubEnv("TMPDIR", MOVED);
    const folder = mkdtempSync(join(base, "stamity-gh-trust-"));
    try {
      writeFileSync(join(folder, "gh"), "#!/bin/sh\nexit 0\n");
      chmodSync(join(folder, "gh"), 0o755);

      expect(() => trustedGh("/", { PATH: `${folder}${delimiter}/usr/bin` }, "/no-such-work-tree", [])).toThrow("gh resolves to a program inside a temp folder");
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });
});
