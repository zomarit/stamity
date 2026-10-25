import semver from "semver";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { COMMANDS } from "../../../src/cli.ts";
import { applySync, planSync } from "../../../src/cli/commands/sync/engine.ts";
import type * as clientModelsModule from "../../../src/cli/engine/clientModels.ts";
import { createManifest, readManifest, writeManifest } from "../../../src/manifest/manifest.ts";
import { canonical } from "../../support/identity.ts";
import { runInProcess } from "../../support/inProcess.ts";
import { useTempDir } from "../../support/tempDir.ts";

/**
 * `upgrade` starts the selected clients' own CLIs (the model-list read `sync`
 * makes, REQ-LADDER-006) only once every refusal before the plan has passed
 * (review/12): a wrong `--to` or a major move without its flag starts none.
 *
 * The client lister is the one stand-in, as in `sync.test.ts`: the real one
 * starts the account's own client CLI, which no test may read. It records each
 * client asked and answers `absent`, as on a machine without that CLI. The
 * sync engine and the corpus are real. Kept apart from `upgrade.test.ts`,
 * which mocks nothing.
 */

const listerAsked = vi.hoisted(() => ({ value: [] as string[] }));
vi.mock("../../../src/cli/engine/clientModels.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof clientModelsModule>();
  return {
    ...actual,
    listClientModels: async (
      ...args: Parameters<typeof actual.listClientModels>
    ): Promise<clientModelsModule.ModelListOutcome> => {
      listerAsked.value.push(args[0]);
      return { kind: "absent" };
    },
  };
});

const tempDir = useTempDir("stamity-upgrade-probe");

const V = canonical().version;
const PARSED = semver.parse(V);
if (PARSED === null || PARSED.minor === 0) {
  throw new Error(`upgradeClientProbe.test.ts needs a running version with a minor above 0, not ${V}`);
}
const FROM = `${PARSED.major}.${PARSED.minor - 1}.0`;
const NEXT_MINOR = `${PARSED.major}.${PARSED.minor + 1}.0`;
const T0 = new Date("2026-01-01T00:00:00.000Z");

/** A Cursor setup written by {@link FROM}, synced once at FROM. */
async function seedCursorSetup(): Promise<string> {
  const root = tempDir().dir;
  const manifest = createManifest({
    tools: ["cursor"],
    selection: { items: { agent: [], skill: [], rule: [], command: [] } },
    generatorVersion: FROM,
    now: T0,
  });
  await writeManifest(root, manifest, { now: T0 });
  const plan = await planSync(root, FROM, {});
  const first = await applySync(root, plan, { engineVersion: FROM, force: false, dryRun: false, now: T0 });
  expect(first.refused, "fixture: the first sync must write everything").toEqual([]);
  return root;
}

beforeEach(() => {
  listerAsked.value = [];
});

describe("upgrade — the client CLIs start only after the refusals", () => {
  it("starts no client CLI when --to names another release", async () => {
    const root = await seedCursorSetup();

    const result = await runInProcess(COMMANDS, ["upgrade", "--to", NEXT_MINOR], { cwd: root });

    expect(result.code).toBe(1);
    expect(listerAsked.value).toEqual([]);
  });

  it("starts no client CLI when a major move lacks --allow-major", async () => {
    const root = await seedCursorSetup();
    const manifest = await readManifest(root);
    if (manifest === null) throw new Error("fixture lost its manifest");
    await writeManifest(root, { ...manifest, generatedBy: `${PARSED.major + 1}.0.0` }, { now: T0 });

    const result = await runInProcess(COMMANDS, ["upgrade", "--to", V, "--allow-downgrade"], { cwd: root });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("--allow-major");
    expect(listerAsked.value).toEqual([]);
  });

  it("reads the selected client's list once the move runs", async () => {
    const root = await seedCursorSetup();

    const result = await runInProcess(COMMANDS, ["upgrade", "--to", V, "--dry-run"], { cwd: root });

    expect(result.code, result.stderr).toBe(0);
    expect(listerAsked.value).toEqual(["cursor"]);
  });
});
