import { existsSync, readFileSync } from "node:fs";
import { rm, symlink } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_NOTICE_TIMEOUT_MS,
  DEFAULT_NOTICE_TTL_MS,
  DEFAULT_REGISTRY_BASE_URL,
  checkForUpdateNotice,
  moveVerb,
  noticeCacheDir,
  noticeOptionsFromFacts,
  readRepositoryPin,
  resolveOwnPackageFacts,
  shouldProbeNotice,
  startupNotice,
  type StartupNoticeInput,
  type UpdateNoticeOptions,
} from "../../../src/cli/notice/updateNotice.ts";
import { canonical } from "../../support/identity.ts";
import { useTempDir } from "../../support/tempDir.ts";

/**
 * Real-filesystem lane. The notice's whole contract is what it does and does
 * NOT touch — no cache file at all on an opted-out or unpublishable-manifest
 * run, a stamp written even when the probe failed, a banner that still appears
 * when the cache directory is unwritable — and none of that is observable on a
 * virtual volume the module never sees (it calls `node:fs/promises` directly,
 * with no fs seam by design: the fetch seam is the one that needs injecting).
 *
 * The network is never real: every case passes `fetchImpl`, and the fetch spy
 * records each call so "did not probe" is asserted as `calls.length === 0`
 * rather than inferred from a return value.
 */

const tempDir = useTempDir("stamity-update-notice");

const PKG = "@zomarit/stamity";
/**
 * The scoped name as the registry serves it: the WHOLE name percent-encoded,
 * `/` included. Pinned as a literal rather than re-derived with
 * `encodeURIComponent` — deriving it would restate the implementation and pass
 * for any encoding the module happened to pick, including one the registry 404s.
 */
const PKG_ENCODED = "%40zomarit%2Fstamity";
const CURRENT = "1.2.2";
const REGISTRY = "https://registry.example.test";
// TEST CHANGE, justified: REQ-FLOW-048 — the stamp is keyed by package name, `/` and `@` read
// as `-`, so the canonical build and a fork on one machine keep separate answers. Spelled out
// rather than derived, as `PKG_ENCODED` is above.
const CACHE_FILE = "update-check--zomarit-stamity.json";

type FetchImpl = NonNullable<UpdateNoticeOptions["fetchImpl"]>;

interface FetchSpy {
  readonly impl: FetchImpl;
  /** Every requested URL, in order. */
  readonly calls: string[];
}

/** Wraps a handler so every invocation is recorded before it runs. */
function spyFetch(handler: FetchImpl): FetchSpy {
  const calls: string[] = [];
  const impl: FetchImpl = async (input, init) => {
    calls.push(String(input));
    return await handler(input, init);
  };
  return { impl, calls };
}

/** A spy that fails the test if anything reaches it — for the no-probe paths. */
function forbiddenFetch(): FetchSpy {
  return spyFetch(() => {
    throw new Error("fetch must not be called on this path");
  });
}

/** Registry answer for the `latest` dist-tag; a real Response, so `.json()` is real. */
function versionResponse(version: string): FetchSpy {
  return spyFetch(
    async () =>
      new Response(JSON.stringify({ version }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  );
}

interface Overrides {
  currentVersion?: string;
  repositoryPin?: string | null;
  isPrivate?: boolean;
  env?: Readonly<Record<string, string | undefined>>;
  ttlMs?: number;
  timeoutMs?: number;
  now?: () => Date;
}

/** Options with every seam pinned: injected clock, injected fetch, private registry host. */
function options(cacheDir: string, fetchImpl: FetchImpl, overrides: Overrides = {}): UpdateNoticeOptions {
  return {
    packageName: PKG,
    currentVersion: overrides.currentVersion ?? CURRENT,
    ...(overrides.repositoryPin === undefined ? {} : { repositoryPin: overrides.repositoryPin }),
    isPrivate: overrides.isPrivate ?? false,
    env: overrides.env ?? {},
    cacheDir,
    registryBaseUrl: REGISTRY,
    fetchImpl,
    ttlMs: overrides.ttlMs ?? DEFAULT_NOTICE_TTL_MS,
    timeoutMs: overrides.timeoutMs ?? 100,
    now: overrides.now ?? (() => new Date()),
  };
}

function cachePath(cacheDir: string): string {
  return join(cacheDir, CACHE_FILE);
}

function readStamp(cacheDir: string): { checkedAt: string; latest: string | null } {
  return JSON.parse(readFileSync(cachePath(cacheDir), "utf8")) as {
    checkedAt: string;
    latest: string | null;
  };
}

/** Fixed clock, so freshness math is exact rather than racing the suite's runtime. */
const NOW = new Date("2026-03-01T12:00:00.000Z");
const at = (offsetMs: number): string => new Date(NOW.getTime() + offsetMs).toISOString();
const frozen = (): (() => Date) => (): Date => NOW;

describe("checkForUpdateNotice — the private-manifest no-op", () => {
  it("returns null before any filesystem or network IO when the manifest is private", async () => {
    const dir = tempDir().path("cache");
    const fetch = forbiddenFetch();

    const notice = await checkForUpdateNotice(
      options(dir, fetch.impl, { isPrivate: true, now: frozen() }),
    );

    expect(notice).toBeNull();
    expect(fetch.calls).toEqual([]);
    // Not merely "no stamp": the cache directory itself is never created, which
    // is the observable proof the path returned ahead of all IO.
    expect(existsSync(dir)).toBe(false);
  });
});

describe("checkForUpdateNotice — env opt-outs", () => {
  const optOuts: readonly (readonly [string, Record<string, string>])[] = [
    ["STAMITY_NO_UPDATE_CHECK=1", { STAMITY_NO_UPDATE_CHECK: "1" }],
    ["NO_UPDATE_NOTIFIER=1", { NO_UPDATE_NOTIFIER: "1" }],
    ["CI=true", { CI: "true" }],
  ];

  for (const [label, env] of optOuts) {
    it(`returns null without probing under ${label}`, async () => {
      const dir = tempDir().path("cache");
      const fetch = forbiddenFetch();

      const notice = await checkForUpdateNotice(options(dir, fetch.impl, { env, now: frozen() }));

      expect(notice).toBeNull();
      expect(fetch.calls).toEqual([]);
      expect(existsSync(dir)).toBe(false);
    });
  }

  it("does not opt out on unrelated or empty values", async () => {
    const dir = tempDir().path("cache");
    const fetch = versionResponse("1.2.3");

    const notice = await checkForUpdateNotice(
      options(dir, fetch.impl, { env: { CI: "", NO_UPDATE_NOTIFIER: "" }, now: frozen() }),
    );

    expect(notice).toContain("1.2.3");
    expect(fetch.calls).toHaveLength(1);
  });

  // REQ-FLOW-048: our switch reads `1`, `true` or `yes`, trimmed and in any case.
  for (const value of ["true", "YES", " 1 "]) {
    it(`opts out on STAMITY_NO_UPDATE_CHECK=${JSON.stringify(value)}`, async () => {
      const dir = tempDir().path("cache");
      const fetch = forbiddenFetch();

      const notice = await checkForUpdateNotice(
        options(dir, fetch.impl, { env: { STAMITY_NO_UPDATE_CHECK: value }, now: frozen() }),
      );

      expect(notice).toBeNull();
      expect(fetch.calls).toEqual([]);
      expect(existsSync(dir)).toBe(false);
    });
  }

  it("does not opt out on STAMITY_NO_UPDATE_CHECK=0", async () => {
    const dir = tempDir().path("cache");
    const fetch = versionResponse("1.2.3");

    const notice = await checkForUpdateNotice(
      options(dir, fetch.impl, { env: { STAMITY_NO_UPDATE_CHECK: "0" }, now: frozen() }),
    );

    expect(notice).toContain("1.2.3");
    expect(fetch.calls).toHaveLength(1);
  });
});

describe("shouldProbeNotice — the probe runs only where its banner can show", () => {
  it("probes on a terminal stderr only, and never on a --json run", () => {
    expect(shouldProbeNotice({ stderrIsTTY: false, argv: ["sync"] })).toBe(false);
    expect(shouldProbeNotice({ stderrIsTTY: true, argv: ["sync", "--json"] })).toBe(false);
    expect(shouldProbeNotice({ stderrIsTTY: true, argv: ["sync"] })).toBe(true);
    // A `--json` after a bare `--` is an operand, not the flag.
    expect(shouldProbeNotice({ stderrIsTTY: true, argv: ["learn", "--", "--json"] })).toBe(true);
  });
});

describe("checkForUpdateNotice — the repository's pin and the upgrade move (REQ-FLOW-048)", () => {
  it("compares with the pin and names `upgrade --to` from 1.17.0 on", async () => {
    const dir = tempDir().path("cache");
    const fetch = versionResponse("1.18.0");

    const notice = await checkForUpdateNotice(
      options(dir, fetch.impl, { currentVersion: "1.18.0", repositoryPin: "1.17.0", now: frozen() }),
    );

    expect(notice).toBe(
      `Update available: 1.17.0 -> 1.18.0. To move: npx -y ${PKG}@1.18.0 upgrade --to 1.18.0. ` +
        "To stay on 1.17.0, do nothing.",
    );
  });

  it("names the pinned sync for a target below 1.17.0", async () => {
    const dir = tempDir().path("cache");
    const fetch = versionResponse("1.10.0");

    const notice = await checkForUpdateNotice(
      options(dir, fetch.impl, { currentVersion: "1.10.0", repositoryPin: "1.9.1", now: frozen() }),
    );

    expect(notice).toBe(
      `Update available: 1.9.1 -> 1.10.0. To move: npx -y ${PKG}@1.10.0 sync. To stay on 1.9.1, do nothing.`,
    );
  });

  it("says nothing when the pin already reads the registry's version", async () => {
    const dir = tempDir().path("cache");
    const fetch = versionResponse("1.18.0");

    const notice = await checkForUpdateNotice(
      options(dir, fetch.impl, { currentVersion: "1.17.0", repositoryPin: "1.18.0", now: frozen() }),
    );

    expect(notice).toBeNull();
  });

  it("ends the move with --allow-major when the majors differ", async () => {
    const dir = tempDir().path("cache");
    const fetch = versionResponse("2.0.0");

    const notice = await checkForUpdateNotice(
      options(dir, fetch.impl, { currentVersion: "1.18.0", repositoryPin: "1.18.0", now: frozen() }),
    );

    expect(notice).toContain(`To move: npx -y ${PKG}@2.0.0 upgrade --to 2.0.0 --allow-major.`);
  });

  it("keeps one stamp per package name", async () => {
    const dir = tempDir().path("cache");
    const first = versionResponse("1.2.3");
    const second = versionResponse("1.2.3");

    await checkForUpdateNotice(options(dir, first.impl, { now: frozen() }));
    await checkForUpdateNotice({ ...options(dir, second.impl, { now: frozen() }), packageName: "@acme/stamity" });

    expect(existsSync(join(dir, CACHE_FILE))).toBe(true);
    expect(existsSync(join(dir, "update-check--acme-stamity.json"))).toBe(true);
    // The second name probed for itself rather than reading the first one's fresh stamp.
    expect(second.calls).toHaveLength(1);
  });
});

describe("readRepositoryPin", () => {
  it("reads devDependencies, then dependencies, then the manifest's generatedBy", async () => {
    const handle = tempDir();
    await handle.seedFiles({
      "package.json": JSON.stringify({ devDependencies: { [PKG]: "^1.17.0" }, dependencies: { [PKG]: "1.16.0" } }),
      ".stamity/manifest.json": JSON.stringify({ generatedBy: "1.15.0" }),
    });
    expect(await readRepositoryPin(handle.dir, PKG)).toBe("1.17.0");

    await handle.seedFiles({ "package.json": JSON.stringify({ dependencies: { [PKG]: "~1.16.2" } }) });
    expect(await readRepositoryPin(handle.dir, PKG)).toBe("1.16.2");

    await handle.seedFiles({ "package.json": JSON.stringify({ devDependencies: { [PKG]: "latest" } }) });
    expect(await readRepositoryPin(handle.dir, PKG)).toBe("1.15.0");
  });

  it("never throws: a malformed package.json and no manifest answer null", async () => {
    const handle = tempDir();
    await handle.seedFiles({ "package.json": "{ not json" });

    expect(await readRepositoryPin(handle.dir, PKG)).toBeNull();
    expect(await readRepositoryPin(handle.path("missing"), PKG)).toBeNull();
  });

  // review/7: the read runs before every command started from a terminal, so a
  // committed link (to a terminal or an endless device, say) must not be followed.
  it.skipIf(process.platform === "win32")("reads a package.json or a manifest that is a link as naming nothing", async () => {
    const handle = tempDir();
    await handle.seedFiles({
      "elsewhere/package.json": JSON.stringify({ devDependencies: { [PKG]: "1.17.0" } }),
      "elsewhere/manifest.json": JSON.stringify({ generatedBy: "1.16.0" }),
      ".stamity/manifest.json": JSON.stringify({ generatedBy: "1.15.0" }),
    });
    await symlink(handle.path("elsewhere", "package.json"), handle.path("package.json"));

    expect(await readRepositoryPin(handle.dir, PKG)).toBe("1.15.0");

    await rm(handle.path(".stamity", "manifest.json"));
    await symlink(handle.path("elsewhere", "manifest.json"), handle.path(".stamity", "manifest.json"));

    expect(await readRepositoryPin(handle.dir, PKG)).toBeNull();
  });

  it("reads a pin source past 1 MiB as naming nothing", async () => {
    const handle = tempDir();
    const padding = "x".repeat(1024 * 1024);
    await handle.seedFiles({
      "package.json": JSON.stringify({ devDependencies: { [PKG]: "1.17.0" }, padding }),
      ".stamity/manifest.json": JSON.stringify({ generatedBy: "1.15.0", padding }),
    });

    expect(await readRepositoryPin(handle.dir, PKG)).toBeNull();
  });
});

describe("moveVerb", () => {
  it("names upgrade for a prerelease of 1.17.0 or later, a fork's included (review/11)", () => {
    expect(moveVerb("1.17.0-fork.1")).toBe("upgrade --to 1.17.0-fork.1");
    expect(moveVerb("1.18.0-rc.2")).toBe("upgrade --to 1.18.0-rc.2");
    expect(moveVerb("1.17.0")).toBe("upgrade --to 1.17.0");
    expect(moveVerb("1.16.9-fork.1")).toBe("sync");
  });
});

/**
 * The startup wiring `src/cli.ts` runs (review/9): the process's facts in, the
 * options `checkForUpdateNotice` is asked with out. The check seam records each
 * call, so "no probe" is a count, not an inference.
 */
describe("startupNotice", () => {
  const FACTS = { name: PKG, version: CURRENT, isPrivate: false, registry: null };

  function recorder(answer: string | null = "banner"): {
    check: (opts: UpdateNoticeOptions) => Promise<string | null>;
    calls: UpdateNoticeOptions[];
  } {
    const calls: UpdateNoticeOptions[] = [];
    return {
      calls,
      check: async (opts) => {
        calls.push(opts);
        return answer;
      },
    };
  }

  function startup(cwd: string, over: Partial<StartupNoticeInput> = {}): StartupNoticeInput {
    return { argv: ["check"], stderrIsTTY: true, cwd, env: {}, facts: FACTS, cacheDir: "/cache", ...over };
  }

  it("asks nothing when stderr is not a terminal, or on a --json run", async () => {
    const handle = tempDir();
    const { check, calls } = recorder();

    expect(await startupNotice(startup(handle.dir, { stderrIsTTY: false }), check)).toBeNull();
    expect(await startupNotice(startup(handle.dir, { argv: ["check", "--json"] }), check)).toBeNull();
    expect(calls).toEqual([]);
  });

  it("asks with the repository's pin, the facts, the env and the cache folder on a terminal", async () => {
    const handle = tempDir();
    await handle.seedFiles({ "package.json": JSON.stringify({ devDependencies: { [PKG]: "~1.1.0" } }) });
    const { check, calls } = recorder();
    const env = { STAMITY_NO_UPDATE_CHECK: "1" };

    expect(await startupNotice(startup(handle.dir, { env }), check)).toBe("banner");
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ packageName: PKG, currentVersion: CURRENT, repositoryPin: "1.1.0", env, cacheDir: "/cache" });
  });

  it("keeps the opt-outs: the real check under STAMITY_NO_UPDATE_CHECK=1 sends no request", async () => {
    const handle = tempDir();
    const fetch = forbiddenFetch();
    const cacheDir = handle.path("cache");

    const banner = await startupNotice(startup(handle.dir, { env: { STAMITY_NO_UPDATE_CHECK: "1" }, cacheDir }), (opts) =>
      checkForUpdateNotice({ ...opts, fetchImpl: fetch.impl }),
    );

    expect(banner).toBeNull();
    expect(fetch.calls).toEqual([]);
    expect(existsSync(cachePath(cacheDir))).toBe(false);
  });
});

describe("checkForUpdateNotice — the strictly-greater guard", () => {
  it("builds the banner from a newer registry version, naming the sync upgrade path", async () => {
    const dir = tempDir().path("cache");
    const fetch = versionResponse("1.2.3");

    // Built literally rather than through the helper, so the ttl, timeout and
    // clock defaults are exercised too.
    const notice = await checkForUpdateNotice({
      packageName: PKG,
      currentVersion: CURRENT,
      isPrivate: false,
      env: {},
      cacheDir: dir,
      registryBaseUrl: REGISTRY,
      fetchImpl: fetch.impl,
    });

    // TEST CHANGE (sw10-first-run-output, REQ-FLOW-022): the banner used to advise
    // `npx <name>@latest sync`, which runs whatever the registry serves on the day it
    // is typed. It now names the exact version through the pinned call, and how to
    // stay. The upgrade path it names is still a sync, which is the claim this case pins.
    expect(notice).toBe(
      `Update available: 1.2.2 -> 1.2.3. To move: npx -y ${PKG}@1.2.3 sync. To stay on 1.2.2, do nothing.`,
    );
    expect(notice).not.toContain("@latest");
    // Scoped-name contract: one path segment, with the scope separator encoded as
    // %2F. An unencoded `@zomarit/stamity` would split into two segments and the
    // registry would answer 404, which this module reports as "no banner" — a
    // silent, permanently-dormant notice rather than a visible failure.
    expect(fetch.calls).toEqual([`${REGISTRY}/${PKG_ENCODED}/latest`]);
    expect(fetch.calls[0]).not.toContain(`/${PKG}/`);
  });

  it("says nothing when the registry reports the running version", async () => {
    const dir = tempDir().path("cache");
    const fetch = versionResponse(CURRENT);

    expect(await checkForUpdateNotice(options(dir, fetch.impl, { now: frozen() }))).toBeNull();
    expect(fetch.calls).toHaveLength(1);
  });

  it("never prompts a downgrade when the registry reports an older version", async () => {
    const dir = tempDir().path("cache");
    const fetch = versionResponse("1.0.0");

    expect(await checkForUpdateNotice(options(dir, fetch.impl, { now: frozen() }))).toBeNull();
  });

  it("stays silent on the shipped pairing: registry latest 0.0.0, running 1.0.0", async () => {
    const dir = tempDir().path("cache");
    const fetch = versionResponse("0.0.0");

    // Not a hypothetical: the registry's `latest` for this scoped name is 0.0.0
    // while the package ships 1.0.0, so this compare runs on every real user's
    // machine. A banner here would read "Update available: 1.0.0 -> 0.0.0" and
    // send every user to a version older than the one they already have.
    const notice = await checkForUpdateNotice(
      options(dir, fetch.impl, { currentVersion: "1.0.0", now: frozen() }),
    );

    expect(notice).toBeNull();
    // The probe DID happen and the answer WAS recorded — so the silence is the
    // strictly-greater guard doing its job, not a probe that quietly failed.
    expect(fetch.calls).toHaveLength(1);
    expect(readStamp(dir)).toEqual({ checkedAt: NOW.toISOString(), latest: "0.0.0" });
  });

  it("shows a prerelease sitting on the latest dist-tag, unfiltered", async () => {
    const dir = tempDir().path("cache");
    const fetch = versionResponse("1.2.3-beta.1");

    const notice = await checkForUpdateNotice(options(dir, fetch.impl, { now: frozen() }));

    // TEST CHANGE (sw10-first-run-output): the exact-version form, as above; the
    // prerelease is still named unfiltered.
    expect(notice).toBe(
      `Update available: 1.2.2 -> 1.2.3-beta.1. To move: npx -y ${PKG}@1.2.3-beta.1 sync. ` +
        "To stay on 1.2.2, do nothing.",
    );
  });

  it("names the exact new version on a pinned 1.9.1 install and never @latest (REQ-FLOW-022)", async () => {
    const dir = tempDir().path("cache");
    const fetch = versionResponse("1.10.0");

    const notice = await checkForUpdateNotice(
      options(dir, fetch.impl, { currentVersion: "1.9.1", now: frozen() }),
    );

    expect(notice).toContain(`npx -y ${PKG}@1.10.0 sync`);
    expect(notice).toContain("To stay on 1.9.1, do nothing.");
    expect(notice).not.toContain("@latest");
  });

  it("puts the normalized version in the move command when the registry answers with a v prefix", async () => {
    const dir = tempDir().path("cache");
    const fetch = versionResponse("v1.3.0");

    const notice = await checkForUpdateNotice(options(dir, fetch.impl, { now: frozen() }));

    expect(notice).toContain(`npx -y ${PKG}@1.3.0 sync`);
    expect(notice).not.toContain("@v1.3.0");
    // review/142: the version line names the same normalized version the command pins.
    expect(notice).toContain("-> 1.3.0. To move:");
    expect(notice).not.toContain("v1.3.0");
  });

  it("stays silent for a package name the pinned call cannot run", async () => {
    const dir = tempDir().path("cache");
    const fetch = versionResponse("1.3.0");

    // A leading dash would read as an npx flag; the pinned call refuses it and the
    // notice's own net turns the refusal into no banner.
    const notice = await checkForUpdateNotice({
      ...options(dir, fetch.impl, { now: frozen() }),
      packageName: "-rf",
    });

    expect(notice).toBeNull();
  });

  it("fails closed when the running version is not semver (dev builds)", async () => {
    const dir = tempDir().path("cache");
    const fetch = versionResponse("9.9.9");

    const notice = await checkForUpdateNotice(
      options(dir, fetch.impl, { currentVersion: "dev", now: frozen() }),
    );

    // No banner and no thrown comparison: `semver.gt` rejects the invalid operand
    // before it is reached.
    expect(notice).toBeNull();
  });
});

describe("checkForUpdateNotice — cache behaviour", () => {
  it("answers from a fresh stamp without touching the network", async () => {
    const dir = tempDir().path("cache");
    await tempDir().seedFiles({
      [`cache/${CACHE_FILE}`]: JSON.stringify({ checkedAt: at(-60_000), latest: "2.0.0" }),
    });
    const fetch = forbiddenFetch();

    const notice = await checkForUpdateNotice(options(dir, fetch.impl, { now: frozen() }));

    expect(notice).toContain("-> 2.0.0");
    expect(fetch.calls).toEqual([]);
  });

  it("re-probes past the ttl and rewrites the stamp", async () => {
    const dir = tempDir().path("cache");
    await tempDir().seedFiles({
      [`cache/${CACHE_FILE}`]: JSON.stringify({
        checkedAt: at(-(DEFAULT_NOTICE_TTL_MS + 60_000)),
        latest: "1.2.2",
      }),
    });
    const fetch = versionResponse("1.3.0");

    const notice = await checkForUpdateNotice(options(dir, fetch.impl, { now: frozen() }));

    expect(notice).toContain("-> 1.3.0");
    expect(fetch.calls).toHaveLength(1);
    expect(readStamp(dir)).toEqual({ checkedAt: NOW.toISOString(), latest: "1.3.0" });
  });

  it("treats a malformed stamp as stale, probes, and rewrites it as valid JSON", async () => {
    const dir = tempDir().path("cache");
    await tempDir().seedFiles({ [`cache/${CACHE_FILE}`]: "{not json" });
    const fetch = versionResponse("1.3.0");

    const notice = await checkForUpdateNotice(options(dir, fetch.impl, { now: frozen() }));

    expect(notice).toContain("-> 1.3.0");
    expect(fetch.calls).toHaveLength(1);
    expect(readStamp(dir)).toEqual({ checkedAt: NOW.toISOString(), latest: "1.3.0" });
  });

  it("reads a future-dated stamp as fresh, so a skewed clock does not probe every run", async () => {
    const dir = tempDir().path("cache");
    await tempDir().seedFiles({
      [`cache/${CACHE_FILE}`]: JSON.stringify({ checkedAt: at(60 * 60 * 1000), latest: "2.0.0" }),
    });
    const fetch = forbiddenFetch();

    // Deliberate: the elapsed-time compare is `now - checkedAt < ttl`, and a
    // negative delta satisfies it. Documented in the module.
    const notice = await checkForUpdateNotice(options(dir, fetch.impl, { now: frozen() }));

    expect(notice).toContain("-> 2.0.0");
    expect(fetch.calls).toEqual([]);
  });
});

describe("checkForUpdateNotice — every probe failure is silent and stamped", () => {
  const failures: readonly (readonly [string, FetchImpl])[] = [
    [
      "a rejected request (DNS, offline)",
      () => {
        throw new Error("ENOTFOUND registry.example.test");
      },
    ],
    ["a non-200 response", async () => new Response("nope", { status: 503 })],
    [
      "a malformed JSON body",
      async () =>
        new Response("<!doctype html>", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    ],
    [
      "a body without a version field",
      async () => new Response(JSON.stringify({ name: PKG }), { status: 200 }),
    ],
  ];

  for (const [label, handler] of failures) {
    it(`returns null and stamps the cache on ${label}`, async () => {
      const dir = tempDir().path("cache");
      const first = spyFetch(handler);

      expect(await checkForUpdateNotice(options(dir, first.impl, { now: frozen() }))).toBeNull();
      expect(first.calls).toHaveLength(1);
      expect(readStamp(dir)).toEqual({ checkedAt: NOW.toISOString(), latest: null });

      // The stamp is what keeps a broken network from being re-probed on every
      // single command for the next 24 hours.
      const second = forbiddenFetch();
      expect(await checkForUpdateNotice(options(dir, second.impl, { now: frozen() }))).toBeNull();
      expect(second.calls).toEqual([]);
    });
  }

  it("returns null when the probe outruns its deadline, and stamps the cache", async () => {
    const dir = tempDir().path("cache");
    // Resolves only when the injected AbortSignal fires, so the timeout is the
    // real thing under test rather than a simulated rejection.
    const hanging = spyFetch(
      async (_input, init) =>
        await new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(init.signal?.reason ?? new Error("aborted"));
          });
        }),
    );

    const notice = await checkForUpdateNotice(
      options(dir, hanging.impl, { timeoutMs: 5, now: frozen() }),
    );

    expect(notice).toBeNull();
    expect(readStamp(dir)).toEqual({ checkedAt: NOW.toISOString(), latest: null });

    // Same suppression the other failure modes get: a registry that hangs is the
    // one most worth not re-probing, since it costs the full deadline each run.
    const second = forbiddenFetch();
    expect(await checkForUpdateNotice(options(dir, second.impl, { now: frozen() }))).toBeNull();
    expect(second.calls).toEqual([]);
  });
});

describe("checkForUpdateNotice — unwritable cache directory", () => {
  it("still returns the banner when the stamp cannot be written", async () => {
    // A regular file where the cache directory should be: `mkdir -p` fails with
    // ENOTDIR, standing in for the EACCES a read-only home produces. Same swallow
    // path, and it needs no chmod games that root would defeat in CI.
    await tempDir().seedFiles({ blocked: "not a directory\n" });
    const dir = tempDir().path("blocked", "nested");
    const fetch = versionResponse("1.2.3");

    const notice = await checkForUpdateNotice(options(dir, fetch.impl, { now: frozen() }));

    expect(notice).toContain("-> 1.2.3");
    expect(existsSync(cachePath(dir))).toBe(false);
  });
});

/**
 * review/167: a fork made with `scripts/fork-identity.mjs --registry` removes
 * `private` and sets `publishConfig.registry`, so it passes step 2. Its scope on
 * the PUBLIC registry may be anybody's, so the notice must ask the fork's own
 * registry and never the default URL — else a third party's publish reaches every
 * operator as the CLI's own move command.
 */
describe("noticeOptionsFromFacts — the registry a fork's notice asks", () => {
  const FORK = "@acme/stamity";
  const FORK_REGISTRY = "https://npm.acme.example/api/npm/";

  it("asks a --registry fork's own registry, never the default URL", async () => {
    const dir = tempDir().path("cache");
    const fetch = versionResponse("1.2.3");
    const opts = noticeOptionsFromFacts(
      { name: FORK, version: CURRENT, isPrivate: false, registry: FORK_REGISTRY },
      {},
      dir,
    );

    const notice = await checkForUpdateNotice({ ...opts, fetchImpl: fetch.impl, now: frozen() });

    expect(opts.registryBaseUrl).toBe(FORK_REGISTRY);
    expect(fetch.calls).toEqual(["https://npm.acme.example/api/npm/%40acme%2Fstamity/latest"]);
    expect(fetch.calls[0]).not.toContain(DEFAULT_REGISTRY_BASE_URL);
    // TEST CHANGE, justified: REQ-PLUGIN-048 — a registry fork names its registry. The move
    // command the banner prints now carries `--@acme:registry=<url>` ahead of the spec, so it
    // fetches the fork's build where the probe found it; the registry asked is unchanged.
    expect(notice).toBe(
      `Update available: 1.2.2 -> 1.2.3. To move: npx -y --@acme:registry=${FORK_REGISTRY} ${FORK}@1.2.3 sync. ` +
        "To stay on 1.2.2, do nothing.",
    );
  });

  it("names the fork's registry in the move command (REQ-PLUGIN-048)", async () => {
    const dir = tempDir().path("cache");
    const fetch = versionResponse("1.12.0-acme.2");
    const opts = noticeOptionsFromFacts(
      { name: FORK, version: "1.12.0-acme.1", isPrivate: false, registry: "https://npm.pkg.github.com" },
      {},
      dir,
    );

    const notice = await checkForUpdateNotice({ ...opts, fetchImpl: fetch.impl, now: frozen() });

    expect(opts.packageRegistry).toBe("https://npm.pkg.github.com");
    expect(notice).toBe(
      "Update available: 1.12.0-acme.1 -> 1.12.0-acme.2. " +
        "To move: npx -y --@acme:registry=https://npm.pkg.github.com @acme/stamity@1.12.0-acme.2 sync. " +
        "To stay on 1.12.0-acme.1, do nothing.",
    );
  });

  it("prints no banner rather than a command naming a registry outside the https grammar", async () => {
    const dir = tempDir().path("cache");
    const fetch = versionResponse("1.2.3");
    const opts = noticeOptionsFromFacts(
      { name: FORK, version: CURRENT, isPrivate: false, registry: "https://npm.acme.example/$(id)/" },
      {},
      dir,
    );

    const notice = await checkForUpdateNotice({ ...opts, fetchImpl: fetch.impl, now: frozen() });

    // Non-degenerate: the probe ran and found a newer version, so only the refusal keeps it silent.
    expect(fetch.calls).toHaveLength(1);
    expect(notice).toBeNull();
  });

  it.each([
    ["answers 401 (needs credentials the probe does not send)", () =>
      spyFetch(async () => new Response("{}", { status: 401 }))],
    ["answers 404", () => spyFetch(async () => new Response("{}", { status: 404 }))],
    ["is unreachable", () =>
      spyFetch(() => {
        throw new TypeError("fetch failed");
      })],
  ])("prints nothing when the fork's registry %s", async (_label, makeFetch) => {
    const dir = tempDir().path("cache");
    const fetch = makeFetch();
    const opts = noticeOptionsFromFacts(
      { name: FORK, version: CURRENT, isPrivate: false, registry: FORK_REGISTRY },
      {},
      dir,
    );

    const notice = await checkForUpdateNotice({ ...opts, fetchImpl: fetch.impl, now: frozen() });

    expect(notice).toBeNull();
    expect(fetch.calls).toHaveLength(1);
    expect(fetch.calls[0]).toMatch(/^https:\/\/npm\.acme\.example\//);
  });

  it("keeps the canonical build on the default registry", async () => {
    const dir = tempDir().path("cache");
    const fetch = versionResponse("1.2.3");
    const opts = noticeOptionsFromFacts(
      { name: PKG, version: CURRENT, isPrivate: false, registry: null },
      {},
      dir,
    );

    const notice = await checkForUpdateNotice({ ...opts, fetchImpl: fetch.impl, now: frozen() });

    expect(opts).not.toHaveProperty("registryBaseUrl");
    expect(opts).not.toHaveProperty("packageRegistry");
    expect(fetch.calls).toEqual([`${DEFAULT_REGISTRY_BASE_URL}/${PKG_ENCODED}/latest`]);
    expect(notice).toContain(`npx -y ${PKG}@1.2.3 sync`);
  });

  it("keeps a package with no npm channel silent, with no probe", async () => {
    const dir = tempDir().path("cache");
    const fetch = forbiddenFetch();
    const opts = noticeOptionsFromFacts(
      { name: FORK, version: CURRENT, isPrivate: true, registry: null },
      {},
      dir,
    );

    expect(await checkForUpdateNotice({ ...opts, fetchImpl: fetch.impl, now: frozen() })).toBeNull();
    expect(fetch.calls).toEqual([]);
    expect(existsSync(dir)).toBe(false);
  });
});

describe("noticeCacheDir", () => {
  it("prefers a non-empty XDG_CACHE_HOME", () => {
    expect(noticeCacheDir({ XDG_CACHE_HOME: join("/xdg", "root") }, join("/home", "u"))).toBe(
      join("/xdg", "root", "stamity"),
    );
  });

  it("falls back to <home>/.cache when XDG_CACHE_HOME is empty or unset", () => {
    const expected = join("/home", "u", ".cache", "stamity");
    expect(noticeCacheDir({ XDG_CACHE_HOME: "" }, join("/home", "u"))).toBe(expected);
    expect(noticeCacheDir({}, join("/home", "u"))).toBe(expected);
  });
});

describe("resolveOwnPackageFacts", () => {
  it("finds this package's own manifest from the module's directory", () => {
    const facts = resolveOwnPackageFacts();
    const manifest = JSON.parse(
      readFileSync(new URL("../../../package.json", import.meta.url), "utf8"),
    ) as { name: string; version: string; publishConfig?: { registry?: unknown } };
    const identity = canonical();
    const registry = manifest.publishConfig?.registry;

    // TEST CHANGE (branch fix round 2, review/167): the facts carry
    // `publishConfig.registry` too — the registry the notice asks a fork's name at.
    expect(facts).toEqual({
      name: manifest.name,
      version: manifest.version,
      isPrivate: identity.private,
      registry: typeof registry === "string" && registry !== "" ? registry : null,
    });
    // TEST CHANGE, justified (audit FORK-3): the two pins below said "this repo is the
    // canonical published package" unconditionally, which a downstream that renamed the
    // package and set `private: true` as `docs/enterprise-forks.md` instructs cannot
    // satisfy. Neither pin is dropped: the canonical branch is the assertion that stood
    // here, and the fork branch states the consequence that matters for THIS module —
    // a private manifest routes into the unpublishable-manifest no-op, so the notice
    // never probes a registry for a package it could not install.
    if (identity.canonical) {
      // The pins that make this a fixture and not a tautology: this repo IS the
      // published package, under the scoped name the registry is asked about, and
      // its manifest carries no `private` flag — so the notice is live, and the
      // strictly-greater guard above is the only thing keeping it quiet.
      expect(facts.name).toBe("@zomarit/stamity");
      expect(facts.isPrivate).toBe(false);
    } else {
      // TEST CHANGE (M-A2b-1): this branch asserted `isPrivate === true` on EVERY
      // non-canonical checkout. `canonical()` is false for any rename — of the name, of the
      // publisher, or of the private flag — so a downstream that renamed the package and
      // left it publishable landed here and failed a suite `docs/enterprise-forks.md` says
      // needs no edit. What this module actually cares about is the flag itself, which the
      // `toEqual` above already pins against `identity.private`; the branch now states the
      // consequence for whichever of the two a renamed checkout is.
      expect(facts.name).toBe(identity.name);
      expect(facts.isPrivate).toBe(identity.private);
    }
  });
});

describe("module defaults", () => {
  it("targets the public npm registry on a one-day window with a sub-second probe budget", () => {
    expect(DEFAULT_REGISTRY_BASE_URL).toBe("https://registry.npmjs.org");
    expect(DEFAULT_NOTICE_TTL_MS).toBe(24 * 60 * 60 * 1000);
    // The probe races the command it decorates; a multi-second default would be
    // felt by the user on an unreachable registry.
    expect(DEFAULT_NOTICE_TIMEOUT_MS).toBe(1_500);
    expect(DEFAULT_NOTICE_TIMEOUT_MS).toBeLessThan(2_000);
  });
});
