import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
// @ts-expect-error — native ESM contributor tool, outside the product package.
import { PASS_IDS, applyPatch, createReplayFixture, renderPlan } from "../../scripts/replay/fixture.mjs";

/**
 * The replay's seeded service: `evals/replay/v1/patches/base.patch` (the service `replay-orders`
 * at S0) and, from the seed-patch unit on, the six pass patches and `seeds.json` that plant the
 * defects in it.
 *
 * The default suite is git only. The `STAMITY_REPLAY_SUITE=1` half builds a real fixture and runs
 * the service's own lint, typecheck and test gates in it — a child `npm` per gate, tens of seconds
 * in all, which is why it is opt-in.
 *
 * Every git call here runs with an empty global config and no system config, so the operator's own
 * settings (a whitespace fixer, a global hooks path) cannot decide whether a patch applies.
 */

const REPO_ROOT = resolve(import.meta.dirname, "../..");
const V1 = join(REPO_ROOT, "evals", "replay", "v1");
const BASE_PATCH = join(V1, "patches", "base.patch");
const REPLAY_SUITE = process.env["STAMITY_REPLAY_SUITE"] === "1";

/** The files the base service carries, as the plan's r3 cell names them. */
const BASE_FILES = [
  ".gitignore",
  ".oxlintrc.json",
  "README.md",
  "config/service.json",
  "docs/api.md",
  "package.json",
  "src/auth/guard.ts",
  "src/config/load.ts",
  "src/events/audit.ts",
  "src/events/emitter.ts",
  "src/http/app.ts",
  "src/http/router.ts",
  "src/http/routes.ts",
  "src/orders/format.ts",
  "src/orders/handlers.ts",
  "src/reports/window.ts",
  "src/server.ts",
  "src/store/db.ts",
  "src/store/query.ts",
  "test/audit.test.ts",
  "test/config.test.ts",
  "test/handlers.test.ts",
  "test/helpers.ts",
  "test/query.test.ts",
  "test/window.test.ts",
  "tsconfig.json",
];

let root: string;
let cleanGlobal: string;

/**
 * The inherited variables that point git at another repository, index or object store, or inject
 * config ahead of the `-c` flags — the set `scripts/replay/fixture.mjs` strips. A run from a git
 * hook carries several, and any one of them would aim these calls at the caller's checkout.
 */
const REDIRECTING_GIT_ENV = new Set([
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_INDEX_FILE",
  "GIT_OBJECT_DIRECTORY",
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_COMMON_DIR",
  "GIT_NAMESPACE",
  "GIT_PREFIX",
  "GIT_CONFIG",
  "GIT_CONFIG_PARAMETERS",
  "GIT_CONFIG_COUNT",
  "GIT_TEMPLATE_DIR",
  "GIT_ATTR_SOURCE",
]);

function gitEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (REDIRECTING_GIT_ENV.has(key) || /^GIT_CONFIG_(?:KEY|VALUE)_\d+$/.test(key)) delete env[key];
  }
  return { ...env, GIT_CONFIG_GLOBAL: cleanGlobal, GIT_CONFIG_NOSYSTEM: "1" };
}

function git(cwd: string, args: string[]): string {
  return execFileSync("git", ["-c", "init.defaultBranch=main", "-c", "core.autocrlf=false", ...args], {
    cwd,
    encoding: "utf8",
    env: gitEnv(),
    stdio: ["ignore", "pipe", "pipe"],
  });
}

/** A fresh, empty repository under the suite's temp root. */
function emptyRepo(name: string): string {
  const dir = join(root, name);
  mkdirSync(dir, { recursive: true });
  git(dir, ["init", "--quiet", "--template="]);
  return dir;
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "stamity-replay-seeds-"));
  cleanGlobal = join(root, "empty.gitconfig");
  writeFileSync(cleanGlobal, "", "utf8");
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true, maxRetries: 5 });
});

describe("base.patch", () => {
  it("applies with git apply --check to an empty repository, creating only new files", () => {
    expect(existsSync(BASE_PATCH), BASE_PATCH).toBe(true);
    const dir = emptyRepo("check");
    // `--check` exits non-zero (and execFileSync throws) on any hunk that does not apply.
    git(dir, ["apply", "--check", BASE_PATCH]);
    const patch = readFileSync(BASE_PATCH, "utf8");
    const headers = [...patch.matchAll(/^diff --git a\/(\S+) b\/\1$/gm)].map((match) => match[1]);
    expect(headers.toSorted()).toEqual(BASE_FILES);
    // One `new file mode` line per file: the patch creates the service, it edits nothing.
    expect(patch.match(/^new file mode 100644$/gm)).toHaveLength(BASE_FILES.length);
  });

  it("pins the service's dev dependencies to the versions this checkout has installed", () => {
    const dir = emptyRepo("pins");
    git(dir, ["apply", "--whitespace=nowarn", BASE_PATCH]);
    const manifest = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as {
      type: string;
      scripts: Record<string, string>;
      dependencies?: Record<string, string>;
      devDependencies: Record<string, string>;
      engines: Record<string, string>;
    };
    expect(manifest.type).toBe("module");
    expect(manifest.dependencies).toBeUndefined();
    expect(manifest.scripts).toMatchObject({ test: "vitest run", typecheck: "tsc --noEmit", lint: "oxlint" });
    expect(manifest.engines).toEqual({ node: ">=22.13" });
    // The fixture links this checkout's node_modules in tests, so the service must compile and run
    // against exactly these versions; an unpinned range would let the two drift apart unseen.
    const installed = Object.fromEntries(
      Object.keys(manifest.devDependencies).map((name) => [
        name,
        (JSON.parse(readFileSync(join(REPO_ROOT, "node_modules", name, "package.json"), "utf8")) as { version: string }).version,
      ]),
    );
    expect(Object.keys(manifest.devDependencies).toSorted()).toEqual(["@types/node", "oxlint", "typescript", "vitest"]);
    expect(manifest.devDependencies).toEqual(installed);
    // The documented defaults and the config file agree at S0 (the config-default seed moves one).
    expect(JSON.parse(readFileSync(join(dir, "config", "service.json"), "utf8"))).toEqual({
      pageSizeDefault: 20,
      maxPageSize: 100,
      retentionDays: 30,
    });
  });
});

describe.skipIf(!REPLAY_SUITE)("base — the service's own gates (set STAMITY_REPLAY_SUITE=1 to run)", () => {
  it(
    "builds a fixture from the base alone with lint, typecheck and test all green",
    () => {
      // A v1 directory holding the real base patch and a plan template with no units: this case
      // proves the base, so the pass patches and the plan the seed unit adds stay out of it.
      const v1Dir = join(root, "v1-base-only");
      mkdirSync(join(v1Dir, "patches"), { recursive: true });
      mkdirSync(join(v1Dir, "plan"), { recursive: true });
      copyFileSync(BASE_PATCH, join(v1Dir, "patches", "base.patch"));
      writeFileSync(
        join(v1Dir, "plan", "001-replay.md"),
        ["---", "id: replay", "stamp: {{STAMP}}", "---", "", "# Replay", "", "## Units", ""].join("\n"),
        "utf8",
      );
      const result = createReplayFixture({
        out: root,
        v1Dir,
        units: [],
        setup: false,
        depsLink: join(REPO_ROOT, "node_modules"),
        runGates: true,
      }) as { gates: Record<"lint" | "typecheck" | "test", { exitCode: number | null; output: string }> };
      const { lint, typecheck, test } = result.gates;
      expect(lint.exitCode, lint.output).toBe(0);
      // Not "Found 0 warnings": oxlint prints no summary at all when it detects an agent
      // (`AI_AGENT`), so the summary is environment-dependent. A diagnostic line in either format
      // names its severity as a singular word, which a clean run never prints.
      expect(lint.output).not.toMatch(/\b(?:warning|error)\b/i);
      expect(typecheck.exitCode, typecheck.output).toBe(0);
      expect(test.exitCode, test.output).toBe(0);
      // Five test files ran and every test passed: a runner that found nothing exits 1, but a
      // count is what separates "the service's tests ran" from "some test file ran".
      expect(test.output).toMatch(/Test Files\s+5 passed \(5\)/);
      // Read from vitest's summary lines only: the service's own tests log to stderr, and a
      // logged word must not decide the verdict.
      expect(test.output).toMatch(/Tests\s+\d+ passed \(\d+\)/);
      expect(test.output).not.toMatch(/^\s*(?:Test Files|Tests)\s[^\n]*\b(?:failed|skipped)\b/m);
    },
    180_000,
  );
});

// ---------------------------------------------------------------------------------------------
// The seeded passes: six pass patches that plant twelve defects and three decoys in the base,
// `seeds.json` that says where each one sits, and the plan template the fixture renders.

const PATCHES = join(V1, "patches");
const SEEDS_JSON = join(V1, "seeds.json");
const PLAN_TEMPLATE = join(V1, "plan", "001-replay.md");
const PASSES = PASS_IDS as readonly string[];

interface Present {
  contains?: string;
  notContains?: string;
}

type Oracle = { kind: "vitest"; file: string } | { kind: "static"; file: string; mustMatch: string[]; mustNotMatch: string[] };

interface Item {
  id: string;
  class?: string;
  severity?: string;
  pass: string;
  file: string;
  locate: { text: string; from: number; to: number };
  present: Present;
  span: [number, number];
  terms: string[];
  oracle?: Oracle;
}

interface SeedsDoc {
  schema: string;
  matcher: { lineTolerance: number; severities: string[] };
  seeds: Item[];
  decoys: Item[];
}

function readSeeds(): SeedsDoc {
  return JSON.parse(readFileSync(SEEDS_JSON, "utf8")) as SeedsDoc;
}

/**
 * The pure seeded chain in one scratch repository: the base applied to the index, then every pass
 * with `git apply --3way`, in chain order. `trees[0]` is the base, `trees[k]` the tree after pass k —
 * the states `span` and `present` are defined against.
 */
interface Chain {
  dir: string;
  trees: string[];
}

function buildChain(): Chain {
  const dir = emptyRepo("chain");
  git(dir, ["apply", "--index", "--whitespace=nowarn", BASE_PATCH]);
  const trees = [git(dir, ["write-tree"]).trim()];
  for (const id of PASSES) {
    // Exits non-zero (and execFileSync throws) on a refused hunk or a merge left with conflicts.
    git(dir, ["apply", "--3way", "--whitespace=nowarn", join(PATCHES, `${id}.patch`)]);
    trees.push(git(dir, ["write-tree"]).trim());
  }
  return { dir, trees };
}

/** `path` as it stands in `tree`, or null when the tree has no such file. */
function fileAt(chain: Chain, tree: string, path: string): string | null {
  const listed = git(chain.dir, ["ls-tree", "--name-only", tree, "--", path]).trim();
  return listed === path ? git(chain.dir, ["cat-file", "blob", `${tree}:${path}`]) : null;
}

/** The `present` rule over one file's content; a missing file reads as empty. */
function holds(present: Present, content: string | null): boolean {
  const text = content ?? "";
  if (present.contains !== undefined && !text.includes(present.contains)) return false;
  if (present.notContains !== undefined && text.includes(present.notContains)) return false;
  return true;
}

/** The static oracle over one file: "pass" means the defect is absent. */
function staticVerdict(oracle: Extract<Oracle, { kind: "static" }>, content: string | null): "pass" | "fail" {
  const text = content ?? "";
  const matched = oracle.mustMatch.every((source) => new RegExp(source).test(text));
  const clean = oracle.mustNotMatch.every((source) => !new RegExp(source).test(text));
  return matched && clean ? "pass" : "fail";
}

describe("the seeded passes", () => {
  let chain: Chain;
  let doc: SeedsDoc;
  let items: Item[];

  beforeAll(() => {
    chain = buildChain();
    doc = readSeeds();
    items = [...doc.seeds, ...doc.decoys];
  });

  it("are exactly the six chain patches beside the base, and apply over it in order with git apply --3way", () => {
    expect(readdirSync(PATCHES).toSorted()).toEqual(["base.patch", ...PASSES.map((id) => `${id}.patch`)].toSorted());
    // One tree per state, and every pass moves the tree: a pass that applied as a no-op would plant nothing.
    expect(chain.trees).toHaveLength(PASSES.length + 1);
    expect(new Set(chain.trees).size).toBe(chain.trees.length);
  });

  it("record on every index line the chain's own blobs, the preimages the fixture stores for --3way", () => {
    for (const [index, id] of PASSES.entries()) {
      const before = chain.trees[index] as string;
      const after = chain.trees[index + 1] as string;
      const blocks = readFileSync(join(PATCHES, `${id}.patch`), "utf8").split(/^(?=diff --git )/m);
      expect(blocks.length, id).toBeGreaterThan(0);
      for (const block of blocks) {
        const header = /^diff --git a\/(\S+) b\/\1$/m.exec(block);
        const ids = /^index ([0-9a-f]+)\.\.([0-9a-f]+)/m.exec(block);
        expect(header, `${id}: a block without a diff header`).not.toBeNull();
        expect(ids, `${id}: ${header?.[1]} has no index line`).not.toBeNull();
        const path = header?.[1] as string;
        const [pre, post] = [ids?.[1] as string, ids?.[2] as string];
        // A new file records zeros as its preimage; anything else must be the blob before this pass.
        if (!/^0+$/.test(pre)) expect(git(chain.dir, ["rev-parse", `${before}:${path}`]).trim().startsWith(pre), `${id} ${path}`).toBe(true);
        expect(git(chain.dir, ["rev-parse", `${after}:${path}`]).trim().startsWith(post), `${id} ${path}`).toBe(true);
      }
    }
  });

  it("build a fixture whose S0 carries every pass under vendor/contrib and none of the answer key", () => {
    const built = createReplayFixture({ out: root, units: PASS_IDS, setup: false, install: false }) as {
      dir: string;
      units: string[];
      planPath: string;
    };
    expect(built.units).toEqual([...PASSES]);
    expect(readdirSync(join(built.dir, "vendor", "contrib")).toSorted()).toEqual(PASSES.map((id) => `${id}.patch`).toSorted());
    const tracked = git(built.dir, ["ls-files"]).split("\n");
    expect(tracked).toContain(built.planPath);
    expect(tracked.filter((path) => /seeds\.json|__oracle__|reference-fixes/.test(path))).toEqual([]);
  });

  it("locate every seed and decoy on exactly one line of the pure seeded tree, at its span", () => {
    const final = chain.trees.at(-1) as string;
    expect(items).toHaveLength(15);
    for (const item of items) {
      const content = fileAt(chain, final, item.file);
      expect(content, `${item.id}: ${item.file} is missing from the seeded tree`).not.toBeNull();
      const text = content as string;
      expect(text.split(item.locate.text).length - 1, `${item.id}: locate.text occurrences`).toBe(1);
      const lines = text.split("\n");
      const at = lines.findIndex((line) => line.includes(item.locate.text)) + 1;
      expect(item.span, item.id).toEqual([at + item.locate.from, at + item.locate.to]);
      expect(item.span[0], item.id).toBeGreaterThanOrEqual(1);
      expect(item.span[0], item.id).toBeLessThanOrEqual(item.span[1]);
      expect(item.span[1], item.id).toBeLessThanOrEqual(lines.length);
    }
  });

  it("hold every present rule from the item's own pass to the end of the chain, and in no state before it", () => {
    for (const item of items) {
      const pass = PASSES.indexOf(item.pass) + 1;
      expect(pass, `${item.id}: pass ${item.pass}`).toBeGreaterThan(0);
      expect(item.present.contains !== undefined || item.present.notContains !== undefined, item.id).toBe(true);
      chain.trees.forEach((tree, state) => {
        // Before the pass — the base and the preceding state included — the defect is not there yet;
        // for the deletion seed that means the line is still present.
        expect(holds(item.present, fileAt(chain, tree, item.file)), `${item.id} at state ${state}`).toBe(state >= pass);
      });
    }
  });

  it("give twelve seeds, three per class and two per pass, Critical exactly for security, and three decoys", () => {
    expect(doc.schema).toBe("stamity/replay-seeds/v1");
    expect(doc.matcher).toEqual({ lineTolerance: 3, severities: ["Critical", "Warning"] });
    expect(doc.seeds).toHaveLength(12);
    expect(doc.decoys).toHaveLength(3);
    expect(new Set(items.map((item) => item.id)).size).toBe(items.length);
    const count = (key: (seed: Item) => string) =>
      Object.fromEntries([...new Set(doc.seeds.map(key))].map((value) => [value, doc.seeds.filter((seed) => key(seed) === value).length]));
    expect(count((seed) => seed.class as string)).toEqual({ security: 3, correctness: 3, contract: 3, "test-weakening": 3 });
    expect(count((seed) => seed.pass)).toEqual(Object.fromEntries(PASSES.map((id) => [id, 2])));
    for (const seed of doc.seeds) expect(seed.severity, seed.id).toBe(seed.class === "security" ? "Critical" : "Warning");
    for (const decoy of doc.decoys) {
      expect(Object.keys(decoy).filter((key) => ["class", "severity", "oracle"].includes(key)), decoy.id).toEqual([]);
      expect(PASSES, decoy.id).toContain(decoy.pass);
    }
    for (const item of items) {
      expect(item.terms.length, item.id).toBeGreaterThanOrEqual(3);
      expect(item.terms.length, item.id).toBeLessThanOrEqual(6);
    }
  });

  it("keep any two spans in one file far enough apart that no line matches both at the line tolerance", () => {
    const tolerance = doc.matcher.lineTolerance;
    const byFile = Map.groupBy(items, (item) => item.file);
    expect([...byFile.values()].some((group) => group.length > 1)).toBe(true);
    for (const [file, group] of byFile) {
      const sorted = group.toSorted((a, b) => a.span[0] - b.span[0]);
      for (let index = 1; index < sorted.length; index += 1) {
        const [previous, next] = [sorted[index - 1] as Item, sorted[index] as Item];
        // Each span widens by the tolerance on both sides, so the gap must exceed twice it.
        expect(next.span[0] - previous.span[1], `${file}: ${previous.id} and ${next.id}`).toBeGreaterThan(2 * tolerance);
      }
    }
  });

  it("name no id the leak gate reads as a private ledger row", () => {
    const ledgerRow = /^(?:AD|Q|AL|EV|DR|B|C|BD)[-‐-―−－]\d{2,4}$/;
    expect(ledgerRow.test(["C", "12"].join("-"))).toBe(true);
    for (const item of items) expect(item.id, item.id).not.toMatch(ledgerRow);
    for (const item of items) expect(item.id).toMatch(/^[a-z][a-z0-9-]*$/);
  });

  it("give each behaviour seed its oracle file and each test-weakening seed a static check red on the seeded tree, green on the base", () => {
    const [base, final] = [chain.trees[0] as string, chain.trees.at(-1) as string];
    for (const seed of doc.seeds) {
      const oracle = seed.oracle as Oracle;
      if (seed.class !== "test-weakening") {
        expect(oracle, seed.id).toEqual({ kind: "vitest", file: `test/__oracle__/${seed.id}.test.ts` });
        continue;
      }
      expect(oracle.kind, seed.id).toBe("static");
      if (oracle.kind !== "static") continue;
      expect(oracle.file, seed.id).toBe(seed.file);
      expect(oracle.mustMatch.length + oracle.mustNotMatch.length, seed.id).toBeGreaterThan(0);
      expect(staticVerdict(oracle, fileAt(chain, final, oracle.file)), `${seed.id} on the seeded tree`).toBe("fail");
      expect(staticVerdict(oracle, fileAt(chain, base, oracle.file)), `${seed.id} on the base`).toBe("pass");
    }
  });

  it("add no line that names a defect, a seed or the answer key", () => {
    const telling = /\b(?:bugs?|buggy|vuln\w*|inject\w*|todo|fixme|xxx|hack\w*|unsafe|insecure|seed\w*|defects?|decoys?|planted|oracles?|traversal)\b/i;
    for (const id of PASSES) {
      const added = readFileSync(join(PATCHES, `${id}.patch`), "utf8")
        .split("\n")
        .filter((line) => line.startsWith("+") && !line.startsWith("+++"));
      expect(added.length, id).toBeGreaterThan(0);
      expect(added.filter((line) => telling.test(line)), id).toEqual([]);
    }
  });
});

/** REPLAY-v1 §9 clause 3: an accepted term matches as a case-insensitive substring of the finding's text. */
function matches(item: Item, finding: string): boolean {
  return item.terms.some((term) => finding.toLowerCase().includes(term.toLowerCase()));
}

describe("the accepted terms", () => {
  const doc = readSeeds();
  const items = [...doc.seeds, ...doc.decoys];
  const byId = new Map(items.map((item) => [item.id, item]));

  it("spend no slot on a term another term of the same item already covers", () => {
    for (const item of items) {
      const lowered = item.terms.map((term) => term.toLowerCase());
      for (const [index, term] of lowered.entries()) {
        const covering = lowered.filter((other, at) => at !== index && term.includes(other));
        expect(covering, `${item.id}: ${term}`).toEqual([]);
      }
    }
  });

  // A finding a competent reviewer writes for the defect, in words other than the planted shape's own.
  const phrasings: Record<string, string[]> = {
    "sec-sql-sort": [
      "The sort query parameter goes straight into ORDER BY; check it against a whitelist of columns.",
      "`sort` is never validated before it reaches the query.",
      "User-controlled sort is interpolated into the SQL string.",
      "SQL injection through ?sort=.",
    ],
    "cor-page-offset": [
      "pageOffset should be (page - 1) * size.",
      "page=1 returns the second page of results.",
      "Off-by-one: pages are documented 1-based but the offset treats them as 0-based.",
    ],
    "cor-date-boundary": [
      "isWithin excludes the until instant although the doc comment says both ends are inclusive.",
      "The upper bound is compared with < instead of <=.",
    ],
    "tw-assert-loosen": [
      "The window assertion now uses toBeDefined, which passes for false as well.",
      "This expectation always passes, so it no longer checks the upper edge.",
    ],
    "sec-missing-guard": [
      "POST /orders/:id/cancel is registered without requireAuth, so anyone can cancel any order.",
      "The cancel route is unprotected.",
      "Missing access control on the cancel route.",
    ],
    "con-event-key": [
      "The event now sends `id` where subscribers read `orderId`.",
      "Renaming the payload key breaks the audit consumer.",
    ],
    "con-config-default": [
      "pageSizeDefault changed to 50 while docs/api.md still says 20.",
      "The documented page size no longer holds.",
      "The default for pageSizeDefault moved from 20 to 50.",
    ],
    "tw-test-skip": [
      "The page-size test is skipped.",
      "it.skip silences the only test that pins the page size, so it never runs.",
      "The default page size test was disabled.",
    ],
    "sec-path-traversal": [
      "`file` can contain ../ and read files outside the invoice directory.",
      "Arbitrary file read through the file query parameter.",
      "The file name is joined without being sanitized.",
    ],
    "cor-swallowed-error": [
      "The catch swallows database errors and answers 200 with an empty list.",
      "A failing query is masked as no orders instead of a 500.",
    ],
    "con-wire-key": [
      "toWire renames total_cents to totalCents, a breaking change for API clients.",
      "The wire key changed to totalCents.",
      "The response key is now camelCase.",
      "Clients that read total_cents get undefined.",
    ],
    "tw-expectation-deleted": [
      "The total_cents expectation was deleted from the list test.",
      "The patch drops the assertion on the order total.",
      "The totals check was removed.",
    ],
    "dec-internal-rename": ["Renaming fmt is a breaking change for consumers of the export."],
    "dec-test-reason": ["The 404 test's expected body was loosened."],
    "dec-allowlist-order": ["The export column is interpolated into the SQL."],
  };

  it("accept each item's common reviewer phrasings, the ledger's named ones among them", () => {
    expect(Object.keys(phrasings).toSorted()).toEqual(items.map((item) => item.id).toSorted());
    for (const [id, texts] of Object.entries(phrasings)) {
      const item = byId.get(id) as Item;
      for (const text of texts) expect(matches(item, text), `${id}: ${text}`).toBe(true);
    }
  });

  // A finding about something else that a reviewer could place at the same lines: no item in that file may accept it.
  const unrelated: [string, string][] = [
    ["src/store/query.ts", "listOrders has no stable tiebreaker, so rows with equal created_at can repeat across pages."],
    ["src/store/paging.ts", "pageOffset can exceed Number.MAX_SAFE_INTEGER for very large sizes."],
    ["src/reports/window.ts", "Comparing timestamps as strings breaks once a stored value carries milliseconds."],
    ["src/http/routes.ts", "routes() builds a new Router on every call; build it once."],
    ["src/events/emitter.ts", "The at timestamp is not checked to be ISO 8601 before serializing."],
    ["src/orders/invoice.ts", "readInvoice rethrows EACCES, which surfaces as an unhandled rejection."],
    ["src/orders/handlers.ts", "size is read with parsePositive but never capped at maxPageSize."],
    ["src/orders/handlers.ts", "toWire's doc comment promises the five keys on the wire (docs/api.md, Orders); give it an explicit return type."],
    ["src/config/load.ts", "exportBatchSize is never validated in config."],
    ["test/window.test.ts", "The FROM and UNTIL fixtures are duplicated across two tests."],
    ["test/handlers.test.ts", "The list test seeds its orders through a helper that hides the timestamps."],
  ];

  it("reject an unrelated finding placed in the item's own file", () => {
    for (const [file, text] of unrelated) {
      const inFile = items.filter((item) => item.file === file);
      expect(inFile.length, file).toBeGreaterThan(0);
      expect(inFile.filter((item) => matches(item, text)).map((item) => item.id), `${file}: ${text}`).toEqual([]);
    }
  });
});

describe("the replay plan template", () => {
  it("renders six unit sections in chain order, each naming its patch, chained by depends_on", () => {
    const stamp = "0123456789abcdef0123456789abcdef01234567";
    const plan = renderPlan(readFileSync(PLAN_TEMPLATE, "utf8"), { stamp, units: PASS_IDS }) as string;
    expect(plan).toMatch(new RegExp(`^stamp: ${stamp} 2026-09-24$`, "m"));
    expect(plan).toMatch(/^id: replay$/m);
    expect(plan).toMatch(/^intent: feature$/m);
    const units = plan.slice(plan.indexOf("\n## Units\n"));
    const sections = units.split(/^(?=### )/m).slice(1);
    const ids = sections.map((section) => /^### ([a-z0-9-]+) /.exec(section)?.[1]);
    expect(ids).toEqual([...PASSES]);
    sections.forEach((section, index) => {
      const id = PASSES[index] as string;
      const dependsOn = /^\|\s*`depends_on`\s*\|\s*(.*?)\s*\|\s*$/m.exec(section)?.[1];
      expect(dependsOn, id).toBe(index === 0 ? "none" : PASSES[index - 1]);
      expect(section, id).toContain(`Apply \`vendor/contrib/${id}.patch\` with \`git apply --3way\`, then `);
      expect(section, id).toMatch(/^\| `verify` \| `npm run lint && npm run typecheck && npm test` \|$/m);
    });
  });
});

describe.skipIf(!REPLAY_SUITE)("the seeded passes — the service's own gates after each pass (set STAMITY_REPLAY_SUITE=1 to run)", () => {
  it(
    "keeps lint, typecheck and test green after every cumulative pass, the one skipped test being the planted skip",
    () => {
      const built = createReplayFixture({
        out: root,
        units: PASS_IDS,
        setup: false,
        depsLink: join(REPO_ROOT, "node_modules"),
      }) as { dir: string };
      const run = (args: string[]) => {
        const result = spawnSync("npm", args, { cwd: built.dir, encoding: "utf8", shell: process.platform === "win32" });
        return { exitCode: result.status, output: `${result.stdout ?? ""}${result.stderr ?? ""}${result.error?.message ?? ""}` };
      };
      for (const [index, id] of PASSES.entries()) {
        applyPatch(built.dir, join(built.dir, "vendor", "contrib", `${id}.patch`), { threeWay: true });
        const lint = run(["run", "lint"]);
        expect(lint.exitCode, `${id} lint\n${lint.output}`).toBe(0);
        // No diagnostic line, in either oxlint format (the base case says why a summary is not read).
        expect(lint.output, `${id} lint`).not.toMatch(/\b(?:warning|error)\b/i);
        const typecheck = run(["run", "typecheck"]);
        expect(typecheck.exitCode, `${id} typecheck\n${typecheck.output}`).toBe(0);
        const test = run(["test"]);
        expect(test.exitCode, `${id} test\n${test.output}`).toBe(0);
        expect(test.output, id).toMatch(/Tests\s+\d+ passed/);
        expect(test.output, id).not.toMatch(/^\s*(?:Test Files|Tests)\s[^\n]*\bfailed\b/m);
        // The config-default pass skips the one test that would expose it; nothing else is skipped.
        const skipped = /^\s*Tests\s[^\n]*\|\s*(\d+) skipped/m.exec(test.output)?.[1] ?? "0";
        expect(skipped, id).toBe(index >= PASSES.indexOf("u2-p2") ? "1" : "0");
      }
    },
    600_000,
  );
});
