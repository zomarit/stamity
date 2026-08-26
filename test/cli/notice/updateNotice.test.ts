import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_NOTICE_TIMEOUT_MS,
  DEFAULT_NOTICE_TTL_MS,
  DEFAULT_REGISTRY_BASE_URL,
  checkForUpdateNotice,
  noticeCacheDir,
  resolveOwnPackageFacts,
  type UpdateNoticeOptions,
} from "../../../src/cli/notice/updateNotice.ts";
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
const CACHE_FILE = "update-check.json";

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

    expect(notice).toBe(`Update available: 1.2.2 -> 1.2.3. Run: npx ${PKG}@latest sync`);
    expect(notice).toContain(`npx ${PKG}@latest sync`);
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

    expect(notice).toBe(`Update available: 1.2.2 -> 1.2.3-beta.1. Run: npx ${PKG}@latest sync`);
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
    ) as { name: string; version: string };

    expect(facts).toEqual({ name: manifest.name, version: manifest.version, isPrivate: false });
    // The pins that make this a fixture and not a tautology: this repo IS the
    // published package, under the scoped name the registry is asked about, and
    // its manifest carries no `private` flag — so the notice is live, and the
    // strictly-greater guard above is the only thing keeping it quiet.
    expect(facts.name).toBe("@zomarit/stamity");
    expect(facts.isPrivate).toBe(false);
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
