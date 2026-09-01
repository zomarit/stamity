import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { configCommand } from "../../../src/cli/commands/config.ts";
import { ORG_POLICY_REL_PATH, loadOrgPolicy } from "../../../src/pack/orgPolicy.ts";
import { CONTENT_CLASSES, type ContentSelection } from "../../../src/types/content.ts";
import { MANIFEST_FILE, MANIFEST_VERSION, type SetupManifest } from "../../../src/types/manifest.ts";
import { STATE_DIR } from "../../../src/types/markers.ts";
import { runInProcess } from "../../support/inProcess.ts";
import { useTempDir, type TempDirHandle } from "../../support/tempDir.ts";

/**
 * `stamity config policy` — the writer for the org trust policy at
 * `.stamity/policy.json`.
 *
 * The gap these cases close. The policy was a read-only artifact: `add` gates
 * every install on it (`src/pack/install.ts`), `sync` gates every projection on
 * it (`src/pack/projection.ts`), two shipped refusals tell the operator to
 * change it — and nothing in the product wrote or checked one, so the only way
 * to adopt it was hand-authored JSON against a grammar published in prose with
 * no example. The loader is FAIL-CLOSED, so a single typo in that hand-authored
 * file refuses every pack install in the repository. The whole surface is
 * therefore judged on one property: a document this command writes is a
 * document `loadOrgPolicy` reads, and a document it refuses never reaches disk.
 *
 * Green-signal guard. `config policy` did not exist before this change — the
 * subcommand switch in `src/cli/commands/config.ts` had five arms and refused a
 * sixth by name — so every case here fails pre-change at the dispatch, not at
 * an assertion. That makes the two structural cases below the ones worth
 * reading, because they are the ones a plausible-but-wrong implementation
 * passes the rest of the suite while failing:
 *
 * - "removing the last allow entry drops the key" — `allow: []` is a VALID
 *   document that denies every pack (allowlist mode, nothing matched), so a
 *   writer that filters a list in place turns "I removed my last rule" into "I
 *   denied everything" with no error anywhere.
 * - "a refused pattern leaves the existing policy byte-for-byte alone" — the
 *   grammar check has to run before the read-modify-write, not inside it.
 *
 * Lane: the in-process CLI runner over a REAL temp directory, matching
 * `./config.test.ts` and `./configMcp.test.ts`. The command's whole job is
 * reading and rewriting an on-disk file through the engine's atomic writer
 * (temp+rename under a cross-process lock), so the virtual-fs lane cannot host
 * it. `runInProcess` defaults env to `{}` and every TTY fact to false, so no
 * ANSI codes reach the assertions.
 */

const timestamp = "2026-01-01T00:00:00.000Z";

/** Empty selection, derived from the class list so a new content class cannot skew a fixture. */
function emptySelection(): ContentSelection {
  const items = {} as ContentSelection["items"];
  for (const contentClass of CONTENT_CLASSES) items[contentClass] = [];
  return { items };
}

function baseManifest(): SetupManifest {
  return {
    version: MANIFEST_VERSION,
    generatedBy: "0.0.0",
    createdAt: timestamp,
    updatedAt: timestamp,
    tools: ["claude"],
    selection: emptySelection(),
    ledger: [],
  };
}

/** Every config path needs an initialised repo; the policy actions are no exception. */
async function seedManifest(handle: TempDirHandle): Promise<void> {
  await handle.seedFiles({
    [`${STATE_DIR}/${MANIFEST_FILE}`]: `${JSON.stringify(baseManifest(), null, 2)}\n`,
  });
}

/** Put a policy file on disk verbatim — including one no writer would produce. */
async function seedPolicy(handle: TempDirHandle, body: string): Promise<void> {
  await handle.seedFiles({ [ORG_POLICY_REL_PATH]: body });
}

function run(handle: TempDirHandle, args: readonly string[]): ReturnType<typeof runInProcess> {
  return runInProcess([configCommand], ["config", "policy", ...args], { cwd: handle.dir });
}

/** The policy file's raw bytes, or null when there is none. */
async function rawPolicy(handle: TempDirHandle): Promise<string | null> {
  const path = handle.path(ORG_POLICY_REL_PATH);
  return existsSync(path) ? await readFile(path, "utf8") : null;
}

const tempDir = useTempDir("stamity-config-policy");

/** The shape a hand-author gets wrong: a partial wildcard the evaluator cannot honor. */
const BAD_PATTERN = "op*";

describe("config policy list", () => {
  it("says there is no policy, and that every source therefore installs", async () => {
    const handle = tempDir();
    await seedManifest(handle);

    const result = await run(handle, ["list"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain(ORG_POLICY_REL_PATH);
    expect(result.stdout).toContain("mode: none");
    expect(result.stdout).toContain("every pack source installs");
    // The path is displayed repo-relative and POSIX, on every platform. The
    // containment assertion above cannot carry this alone: an ABSOLUTE posix
    // path contains the relative one, so a regression to printing the machine
    // layout passes it here and fails only on the Windows leg, one CI
    // round-trip later. These two pin it where it can be seen locally — no
    // drive letter, no separator that is not `/`, nothing above the repo root.
    const pathLine = result.stdout.split("\n")[0] ?? "";
    expect(pathLine.trim()).toBe(ORG_POLICY_REL_PATH);
    expect(result.stdout).not.toContain(handle.dir);
    // A read never creates the artifact it reports on.
    expect(await rawPolicy(handle)).toBeNull();
  });

  it("names denylist mode and both rule lists", async () => {
    const handle = tempDir();
    await seedManifest(handle);
    await seedPolicy(handle, `${JSON.stringify({ version: 1, packs: { deny: ["local-path"] } })}\n`);

    const result = await run(handle, ["list"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("mode: denylist");
    expect(result.stdout).toContain("deny   local-path");
    expect(result.stdout).toContain("allow  none");
  });

  it("names allowlist mode, where an unmatched source is refused", async () => {
    const handle = tempDir();
    await seedManifest(handle);
    await seedPolicy(
      handle,
      `${JSON.stringify({ version: 1, packs: { allow: ["catalog-pinned"] } })}\n`,
    );

    const result = await run(handle, ["list"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("mode: allowlist");
    expect(result.stdout).toContain("REFUSED");
  });

  it("is what a bare `config policy` runs", async () => {
    const handle = tempDir();
    await seedManifest(handle);

    const result = await run(handle, []);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("mode: none");
  });
});

describe("config policy init", () => {
  it("writes an empty document the loader reads back as an inert policy", async () => {
    const handle = tempDir();
    await seedManifest(handle);

    const result = await run(handle, ["init"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("created");
    expect(result.stdout).toContain("restricts nothing");

    // The property the whole surface rests on: what was written is what the
    // fail-closed loader accepts.
    expect(await loadOrgPolicy(handle.dir)).toEqual({ version: 1, packs: {} });
    // Two-space JSON with a trailing newline — this file is committed and read
    // by people.
    expect(await rawPolicy(handle)).toBe('{\n  "version": 1,\n  "packs": {}\n}\n');
  });

  it("refuses to replace an existing policy, and names the flag that would", async () => {
    const handle = tempDir();
    await seedManifest(handle);
    const existing = `${JSON.stringify({ version: 1, packs: { deny: ["npm-package"] } }, null, 2)}\n`;
    await seedPolicy(handle, existing);

    const result = await run(handle, ["init"]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("a policy already exists");
    expect(result.stderr).toContain("--force");
    // The refusal is worth nothing if the rules it protected are gone.
    expect(await rawPolicy(handle)).toBe(existing);
  });

  it("--force replaces it", async () => {
    const handle = tempDir();
    await seedManifest(handle);
    await seedPolicy(handle, `${JSON.stringify({ version: 1, packs: { deny: ["*"] } })}\n`);

    const result = await run(handle, ["init", "--force"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("replaced");
    expect(await loadOrgPolicy(handle.dir)).toEqual({ version: 1, packs: {} });
  });
});

describe("config policy allow / deny", () => {
  it("creates the document on the first rule and appends to it after", async () => {
    const handle = tempDir();
    await seedManifest(handle);

    const first = await run(handle, ["deny", "local-path"]);
    expect(first.code).toBe(0);
    expect(first.stdout).toContain("added local-path to packs.deny");
    expect(await loadOrgPolicy(handle.dir)).toEqual({
      version: 1,
      packs: { deny: ["local-path"] },
    });

    const second = await run(handle, ["deny", "@acme/*"]);
    expect(second.code).toBe(0);
    // Order is preserved: list order decides which rule is REPORTED as the one
    // that matched.
    expect(await loadOrgPolicy(handle.dir)).toEqual({
      version: 1,
      packs: { deny: ["local-path", "@acme/*"] },
    });
  });

  it("announces the mode shift the first allow entry causes, and only that one", async () => {
    const handle = tempDir();
    await seedManifest(handle);

    const first = await run(handle, ["allow", "catalog-pinned"]);
    expect(first.code).toBe(0);
    expect(first.stdout).toContain("ALLOWLIST mode");

    const second = await run(handle, ["allow", "@acme/ops"]);
    expect(second.code).toBe(0);
    // Already in allowlist mode; the second entry widens it rather than
    // switching anything, so the warning must not fire again.
    expect(second.stdout).not.toContain("ALLOWLIST mode");
    expect(await loadOrgPolicy(handle.dir)).toEqual({
      version: 1,
      packs: { allow: ["catalog-pinned", "@acme/ops"] },
    });
  });

  it("is idempotent: a pattern already on the list is reported, not duplicated", async () => {
    const handle = tempDir();
    await seedManifest(handle);
    await run(handle, ["deny", "npm-package"]);
    const before = await rawPolicy(handle);

    const result = await run(handle, ["deny", "npm-package"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("nothing to add");
    expect(await rawPolicy(handle)).toBe(before);
  });

  it("refuses a pattern outside the grammar, states the grammar, and writes nothing", async () => {
    const handle = tempDir();
    await seedManifest(handle);

    const result = await run(handle, ["allow", BAD_PATTERN]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain(`"${BAD_PATTERN}" is not a valid policy pattern`);
    // The grammar, in full, so the operator can write a pattern that lands.
    expect(result.stderr).toContain(
      'Patterns are an exact pack id, "@scope/*", "*", or a source kind (local-path, npm-package, catalog-pinned).',
    );
    expect(result.stderr).toContain('uses "*" outside the two wildcard forms');
    // Fail-closed is the whole point: a refused pattern must not have created a
    // policy file, because an unreadable or over-narrow one refuses every install.
    expect(await rawPolicy(handle)).toBeNull();
  });

  it("a refused pattern leaves an existing policy byte-for-byte alone", async () => {
    const handle = tempDir();
    await seedManifest(handle);
    const existing = `${JSON.stringify({ version: 1, packs: { deny: ["local-path"] } }, null, 2)}\n`;
    await seedPolicy(handle, existing);

    const result = await run(handle, ["deny", "a/b/c"]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("is not a valid policy pattern");
    expect(await rawPolicy(handle)).toBe(existing);
  });

  it("needs a pattern, and says so with the grammar rather than a usage stub", async () => {
    const handle = tempDir();
    await seedManifest(handle);

    const result = await run(handle, ["allow"]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("config policy allow needs a pattern");
    expect(result.stderr).toContain('"@scope/*"');
  });
});

describe("config policy remove", () => {
  it("drops the rule and reports which list it came out of", async () => {
    const handle = tempDir();
    await seedManifest(handle);
    await seedPolicy(
      handle,
      `${JSON.stringify({ version: 1, packs: { deny: ["local-path", "@acme/*"] } })}\n`,
    );

    const result = await run(handle, ["remove", "local-path"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("removed local-path from packs.deny");
    expect(await loadOrgPolicy(handle.dir)).toEqual({ version: 1, packs: { deny: ["@acme/*"] } });
  });

  it("drops the KEY when the last allow entry goes, rather than leaving an empty list", async () => {
    const handle = tempDir();
    await seedManifest(handle);
    await seedPolicy(
      handle,
      `${JSON.stringify({ version: 1, packs: { allow: ["@acme/ops"], deny: ["local-path"] } })}\n`,
    );

    const result = await run(handle, ["remove", "@acme/ops"]);

    expect(result.code).toBe(0);
    // `allow: []` is a valid document that denies EVERY pack — the opposite of
    // what removing the last restriction means.
    expect(await loadOrgPolicy(handle.dir)).toEqual({
      version: 1,
      packs: { deny: ["local-path"] },
    });
    expect(await rawPolicy(handle)).not.toContain("allow");
    expect(result.stdout).toContain("DENYLIST mode");
  });

  it("refuses a pattern that is on neither list rather than reporting a no-op removal", async () => {
    const handle = tempDir();
    await seedManifest(handle);
    await seedPolicy(handle, `${JSON.stringify({ version: 1, packs: { deny: ["local-path"] } })}\n`);

    const result = await run(handle, ["remove", "npm-package"]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("is not in the org trust policy");
    expect(result.stderr).toContain("deny: local-path");
  });

  it("removes a pattern this engine's grammar would no longer accept", async () => {
    const handle = tempDir();
    await seedManifest(handle);
    // Written through the engine's own writer would be impossible; an older
    // engine or a hand edit is exactly how it gets there, and removing it is
    // the repair. Membership is judged against the FILE, not the grammar — but
    // the file still has to load, so the stale entry is one this grammar
    // accepts while the operator no longer wants it.
    await seedPolicy(
      handle,
      `${JSON.stringify({ version: 1, packs: { deny: ["catalog-pinned"] } })}\n`,
    );

    const result = await run(handle, ["remove", "catalog-pinned"]);

    expect(result.code).toBe(0);
    expect(await loadOrgPolicy(handle.dir)).toEqual({ version: 1, packs: {} });
  });
});

describe("a policy already on disk that does not parse", () => {
  /** Version as a string: the shape a hand-author reaches for, and the loader refuses. */
  const MALFORMED = `${JSON.stringify({ version: "1", packs: {} }, null, 2)}\n`;

  // Every action but `init --force`, one case each: the read refuses for the
  // same reason the three rewrites do, so a fix that unblocked `list` alone —
  // rendering half a policy that is currently refusing every install — would
  // fail here rather than look like progress.
  it.each([
    { args: ["list"] },
    { args: ["allow", "@acme/ops"] },
    { args: ["deny", "local-path"] },
    { args: ["remove", "local-path"] },
  ])("refuses `config policy $args`, naming the defect and the way out", async ({ args }) => {
    const handle = tempDir();
    await seedManifest(handle);
    await seedPolicy(handle, MALFORMED);

    const result = await run(handle, args);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Invalid org trust policy");
    expect(result.stderr).toContain("`version` must be the number 1");
    // The step the engine's own error cannot carry: there is a command that
    // gets the repo out of fail-closed.
    expect(result.stderr).toContain("config policy init --force");
    // Nothing repaired it silently, which is what fail-closed means.
    expect(await rawPolicy(handle)).toBe(MALFORMED);
  });

  it("init --force is the way out, and plain init still refuses", async () => {
    const handle = tempDir();
    await seedManifest(handle);
    await seedPolicy(handle, MALFORMED);

    const refused = await run(handle, ["init"]);
    expect(refused.code).toBe(1);
    expect(refused.stderr).toContain("does not parse");
    expect(await rawPolicy(handle)).toBe(MALFORMED);

    const forced = await run(handle, ["init", "--force"]);
    expect(forced.code).toBe(0);
    expect(await loadOrgPolicy(handle.dir)).toEqual({ version: 1, packs: {} });
  });
});

describe("--dry-run", () => {
  it("prints the document it would create and writes nothing", async () => {
    const handle = tempDir();
    await seedManifest(handle);

    const result = await run(handle, ["init", "--dry-run"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("would create");
    expect(result.stdout).toContain('"version": 1');
    expect(result.stdout).toContain("re-run without --dry-run");
    expect(await rawPolicy(handle)).toBeNull();
  });

  it("previews an added rule against the real document and writes nothing", async () => {
    const handle = tempDir();
    await seedManifest(handle);
    const existing = `${JSON.stringify({ version: 1, packs: { deny: ["local-path"] } }, null, 2)}\n`;
    await seedPolicy(handle, existing);

    const result = await run(handle, ["allow", "@acme/*", "--dry-run"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("would add @acme/* to packs.allow");
    // The consequence is disclosed on the preview branch too — a dry run is
    // where an operator goes to find out what a change would do.
    expect(result.stdout).toContain("ALLOWLIST mode");
    expect(await rawPolicy(handle)).toBe(existing);
  });

  it("previews a removal and writes nothing", async () => {
    const handle = tempDir();
    await seedManifest(handle);
    const existing = `${JSON.stringify({ version: 1, packs: { deny: ["local-path"] } }, null, 2)}\n`;
    await seedPolicy(handle, existing);

    const result = await run(handle, ["remove", "local-path", "--dry-run"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("would remove local-path from packs.deny");
    expect(await rawPolicy(handle)).toBe(existing);
  });
});

describe("the funnel", () => {
  it("emits one JSON document carrying the written policy", async () => {
    const handle = tempDir();
    await seedManifest(handle);

    const result = await run(handle, ["deny", "npm-package", "--json"]);

    expect(result.code).toBe(0);
    const lines = result.stdout.trim().split("\n");
    expect(lines).toHaveLength(1);
    const doc = JSON.parse(lines[0] ?? "") as Record<string, unknown>;
    expect(doc["ok"]).toBe(true);
    expect(doc["command"]).toBe("config");
    expect(doc["changed"]).toBe(true);
    expect(doc["mode"]).toBe("denylist");
    expect(doc["deny"]).toEqual(["npm-package"]);
    expect(doc["policy"]).toEqual({ version: 1, packs: { deny: ["npm-package"] } });
  });

  it("exits 1 on an unknown policy action, naming the five", async () => {
    const handle = tempDir();
    await seedManifest(handle);

    const result = await run(handle, ["enable"]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('unknown policy action "enable"');
    expect(result.stderr).toContain("list, init, allow, deny, remove");
  });

  it("routes an uninitialised repo to init, like every other config path", async () => {
    const handle = tempDir();

    const result = await run(handle, ["list"]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("no stamity setup found");
  });

  it("advertises policy in the config subcommand set", async () => {
    const handle = tempDir();
    await seedManifest(handle);

    const result = await runInProcess([configCommand], ["config", "nonsense"], {
      cwd: handle.dir,
    });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("list, get, set, detect, mcp, policy");
  });
});
