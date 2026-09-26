import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
// @ts-expect-error — native ESM contributor tool, outside the product package.
import { matchItems } from "../../scripts/replay/findings.mjs";
// @ts-expect-error — native ESM contributor tool, outside the product package.
import { PASS_IDS, applyPatch, createReplayFixture, dataDirOf, renderPlan } from "../../scripts/replay/fixture.mjs";
// @ts-expect-error — native ESM contributor tool, outside the product package.
import { checkSeeds, presentIn } from "../../scripts/replay/measure.mjs";

/**
 * REPLAY-v2's fixture data (`evals/replay/v2/`, plan 011's v2-fixture unit): the clean chain the
 * units apply, and the seeds the driver injects at the first review dispatch covering each pass.
 *
 * v1 planted its twelve defects in the pass patches, so every unit saw them before any reviewer did
 * (`build/362`). v2's patches are v1's minus their seeded hunks, and each seed carries an
 * `injection` (contract S1): the clean text `find` in the seed's own file, and the seeded text
 * `replace` it becomes. What holds here: the chain applies clean; every anchor is unique; the
 * injections give the seeded tree, where every seed reads present through the scorer's own
 * `presentIn`, and the reference fixes give back the clean tree, where none does; and the run's
 * shape (a pass applied, then its seeds injected, then the next pass) applies without a conflict.
 *
 * Git only: the service's gates and the oracles run in `oracle-v2.test.ts` behind
 * `STAMITY_REPLAY_SUITE=1`. Every git call runs with an empty global config and no system config.
 */

const REPO_ROOT = resolve(import.meta.dirname, "../..");
const V1 = join(REPO_ROOT, "evals", "replay", "v1");
const V2 = dataDirOf("v2") as string;
const PATCHES = join(V2, "patches");
const PASSES = PASS_IDS as readonly string[];

/**
 * The budget of a case that spawns git a few hundred times. Each spawn costs several times more on
 * the Windows leg than on darwin (v1's compile case: 21.1 s there against the 20 s default), and the
 * slowest case here takes 3-4 s on darwin.
 */
const GIT_HEAVY_MS = 60_000;

interface Injection {
  file: string;
  find: string;
  replace: string;
}

interface Present {
  contains?: string;
  notContains?: string;
  notMatch?: string[];
}

interface Item {
  id: string;
  class?: string;
  severity?: string;
  pass: string;
  file: string;
  locate: { text: string; from: number; to: number };
  present: Present;
  injection?: Injection;
  span: [number, number];
  terms: string[];
  oracle?: unknown;
}

type Seed = Item & { injection: Injection };

interface SeedsDoc {
  schema: string;
  matcher: { lineTolerance: number; severities: string[] };
  seeds: Seed[];
  decoys: Item[];
}

const readDoc = (dir: string) => JSON.parse(readFileSync(join(dir, "seeds.json"), "utf8")) as SeedsDoc;

let root: string;
let cleanGlobal: string;

/** The inherited variables that aim git at another repository or inject config; the set `fixture.mjs` strips. */
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

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "stamity-replay-seeds-v2-"));
  cleanGlobal = join(root, "empty.gitconfig");
  writeFileSync(cleanGlobal, "", "utf8");
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true, maxRetries: 5 });
});

/**
 * A refusal naming the seed for every injection whose `find` does not occur exactly once in its
 * file as `read` returns it (null: the file is absent). The driver's hook replaces the first
 * occurrence, so a second one would leave the tree it injects ambiguous.
 */
function anchorFailures(seeds: readonly Seed[], read: (file: string) => string | null): string[] {
  return seeds.flatMap((seed) => {
    const count = (read(seed.injection.file) ?? "").split(seed.injection.find).length - 1;
    return count === 1 ? [] : [`${seed.id}: injection.find occurs ${count} times in ${seed.injection.file}`];
  });
}

/** Apply one seed's injection to the working tree at `dir`, as the driver's hook does: `find` → `replace`, once. */
function inject(dir: string, seed: Seed): void {
  const path = join(dir, ...seed.injection.file.split("/"));
  const text = readFileSync(path, "utf8");
  const [failure] = anchorFailures([seed], () => text);
  if (failure !== undefined) throw new Error(failure);
  writeFileSync(path, text.replace(seed.injection.find, () => seed.injection.replace), "utf8");
}

/** A directory holding `files` (repository-relative, POSIX) with the given contents, for `presentIn`. */
function treeWith(name: string, files: Record<string, string | null>): string {
  const dir = join(root, name);
  for (const [file, text] of Object.entries(files)) {
    if (text === null) continue;
    const path = join(dir, ...file.split("/"));
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text, "utf8");
  }
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * The clean chain in one scratch repository: the base, then every pass with `git apply --3way`
 * (`trees[k]` is the tree after pass k, `trees[0]` the base); then every injection over the chain's
 * end (`seeded`); then the reference fixes over that (`fixed`).
 */
interface Chain {
  dir: string;
  trees: string[];
  seeded: string;
  fixed: string;
}

function buildChain(seeds: readonly Seed[]): Chain {
  const dir = join(root, "chain");
  mkdirSync(dir, { recursive: true });
  git(dir, ["init", "--quiet", "--template="]);
  git(dir, ["apply", "--index", "--whitespace=nowarn", join(PATCHES, "base.patch")]);
  const trees = [git(dir, ["write-tree"]).trim()];
  for (const id of PASSES) {
    // Exits non-zero (and execFileSync throws) on a refused hunk or a merge left with conflicts.
    git(dir, ["apply", "--3way", "--whitespace=nowarn", join(PATCHES, `${id}.patch`)]);
    trees.push(git(dir, ["write-tree"]).trim());
  }
  for (const seed of seeds) inject(dir, seed);
  git(dir, ["add", "--all"]);
  const seeded = git(dir, ["write-tree"]).trim();
  git(dir, ["apply", "--index", "--whitespace=nowarn", join(V2, "oracle", "reference-fixes.patch")]);
  const fixed = git(dir, ["write-tree"]).trim();
  return { dir, trees, seeded, fixed };
}

/** `path` as it stands in `tree`, or null when the tree has no such file. */
function fileAt(chain: Chain, tree: string, path: string): string | null {
  const listed = git(chain.dir, ["ls-tree", "--name-only", tree, "--", path]).trim();
  return listed === path ? git(chain.dir, ["cat-file", "blob", `${tree}:${path}`]) : null;
}

/** Every item's file as it stands in `tree`, written to a directory `presentIn` reads. */
function copyOf(chain: Chain, tree: string, items: readonly Item[], name: string): string {
  return treeWith(name, Object.fromEntries(items.map((item) => [item.file, fileAt(chain, tree, item.file)])));
}

describe("the v2 fixture data", () => {
  let doc: SeedsDoc;
  let items: Item[];
  let chain: Chain;

  beforeAll(() => {
    doc = readDoc(V2);
    items = [...doc.seeds, ...doc.decoys];
    chain = buildChain(doc.seeds);
  }, GIT_HEAVY_MS);

  it("keeps v1's base.patch byte for byte, beside exactly the six pass patches", () => {
    expect(readFileSync(join(PATCHES, "base.patch"), "utf8")).toBe(readFileSync(join(V1, "patches", "base.patch"), "utf8"));
    expect(readdirSync(PATCHES).toSorted()).toEqual(["base.patch", ...PASSES.map((id) => `${id}.patch`)].toSorted());
  });

  it("applies as a chain over the base with git apply --3way, every pass moving the tree", () => {
    expect(chain.trees).toHaveLength(PASSES.length + 1);
    expect(new Set(chain.trees).size).toBe(chain.trees.length);
  });

  it("records on every index line the clean chain's own blobs, the preimages the fixture stores for --3way", () => {
    for (const [index, id] of PASSES.entries()) {
      const [before, after] = [chain.trees[index] as string, chain.trees[index + 1] as string];
      for (const block of readFileSync(join(PATCHES, `${id}.patch`), "utf8").split(/^(?=diff --git )/m)) {
        const path = /^diff --git a\/(\S+) b\/\1$/m.exec(block)?.[1];
        const ids = /^index ([0-9a-f]+)\.\.([0-9a-f]+)/m.exec(block);
        expect(path, `${id}: a block without a diff header`).toBeDefined();
        expect(ids, `${id}: ${path} has no index line`).not.toBeNull();
        const [pre, post] = [ids?.[1] as string, ids?.[2] as string];
        if (!/^0+$/.test(pre)) expect(git(chain.dir, ["rev-parse", `${before}:${path}`]).trim().startsWith(pre), `${id} ${path}`).toBe(true);
        expect(git(chain.dir, ["rev-parse", `${after}:${path}`]).trim().startsWith(post), `${id} ${path}`).toBe(true);
      }
    }
  }, GIT_HEAVY_MS);

  it("builds a fixture from the v2 data whose S0 carries every pass under vendor/contrib and none of the answer key", () => {
    const built = createReplayFixture({ out: root, v1Dir: V2, units: PASS_IDS, setup: false, install: false }) as { dir: string; units: string[] };
    expect(built.units).toEqual([...PASSES]);
    expect(readdirSync(join(built.dir, "vendor", "contrib")).toSorted()).toEqual(PASSES.map((id) => `${id}.patch`).toSorted());
    expect(git(built.dir, ["ls-files"]).split("\n").filter((path) => /seeds\.json|__oracle__|reference-fixes/.test(path))).toEqual([]);
  }, GIT_HEAVY_MS);

  it("passes the seeds schema check, with an injection on every seed in the seed's own file and none on a decoy", () => {
    expect(() => checkSeeds(doc)).not.toThrow();
    for (const seed of doc.seeds) {
      expect(Object.keys(seed.injection).toSorted(), seed.id).toEqual(["file", "find", "replace"]);
      expect(seed.injection.file, seed.id).toBe(seed.file);
    }
    for (const decoy of doc.decoys) expect(decoy.injection, decoy.id).toBeUndefined();
  });

  it("refuses at the schema check an injection that would span two files", () => {
    const [first] = doc.seeds as [Seed];
    const spanning = { ...doc, seeds: [{ ...first, injection: { ...first.injection, file: "src/orders/handlers.ts" } }, ...doc.seeds.slice(1)] };
    expect(() => checkSeeds(spanning)).toThrow(/sec-sql-sort.*an injection edits one file/);
  });

  it("finds every injection anchor exactly once in its file, at its own pass and at the chain's end", () => {
    const end = chain.trees.at(-1) as string;
    expect(anchorFailures(doc.seeds, (file) => fileAt(chain, end, file))).toEqual([]);
    for (const seed of doc.seeds) {
      const atPass = chain.trees[PASSES.indexOf(seed.pass) + 1] as string;
      expect(anchorFailures([seed], (file) => fileAt(chain, atPass, file)), seed.id).toEqual([]);
    }
  }, GIT_HEAVY_MS);

  it("names the seed whose anchor occurs twice", () => {
    const seed = doc.seeds.find((item) => item.id === "cor-page-offset") as Seed;
    const doubled = `${seed.injection.find}${seed.injection.find}`;
    expect(anchorFailures([seed], () => doubled)).toEqual(["cor-page-offset: injection.find occurs 2 times in src/store/paging.ts"]);
    expect(() => inject(treeWith("doubled", { [seed.file]: doubled }), seed)).toThrow("cor-page-offset: injection.find occurs 2 times");
  });

  it("starts clean: no seed reads present in any state of the chain, and each decoy from its own pass on", () => {
    chain.trees.forEach((tree, state) => {
      const copy = copyOf(chain, tree, items, `clean-${state}`);
      for (const seed of doc.seeds) expect(presentIn(copy, seed), `${seed.id} at state ${state}`).not.toBe(true);
      for (const decoy of doc.decoys) {
        expect(presentIn(copy, decoy) === true, `${decoy.id} at state ${state}`).toBe(state >= PASSES.indexOf(decoy.pass) + 1);
      }
    });
  }, GIT_HEAVY_MS);

  it("gives the seeded tree when every injection is applied: every seed reads present there, every decoy too", () => {
    const copy = copyOf(chain, chain.seeded, items, "seeded");
    for (const item of items) expect(presentIn(copy, item), item.id).toBe(true);
  }, GIT_HEAVY_MS);

  it("injects sec-sql-sort to v1's seeded query.ts byte for byte, leaving no allowlist behind", () => {
    // review/88: an exported allowlist the injected line no longer consults would hint the seed.
    const v1Block = readFileSync(join(V1, "patches", "u1-p1.patch"), "utf8")
      .split(/^(?=diff --git )/m)
      .find((block) => block.startsWith("diff --git a/src/store/query.ts ")) as string;
    const v1Seeded = /^index [0-9a-f]+\.\.([0-9a-f]+)/m.exec(v1Block)?.[1] as string;
    expect(v1Seeded).toMatch(/^[0-9a-f]{40}$/);
    expect(git(chain.dir, ["rev-parse", `${chain.seeded}:src/store/query.ts`]).trim()).toBe(v1Seeded);
    expect(fileAt(chain, chain.trees.at(-1) as string, "src/store/query.ts")).not.toMatch(/\bexport const\b/);
  });

  it("reads every seed absent after the reference fixes, which give back the chain's end byte for byte", () => {
    expect(chain.fixed).toBe(chain.trees.at(-1));
    const copy = copyOf(chain, chain.fixed, items, "fixed");
    for (const seed of doc.seeds) expect(presentIn(copy, seed), seed.id).toBe(false);
    // build/365: the allowlist guard beside the interpolated column reads absent, by `notMatch`.
    const sql = doc.seeds.find((seed) => seed.id === "sec-sql-sort") as Seed;
    const guarded = readFileSync(join(copy, "src", "store", "query.ts"), "utf8").replace("ORDER BY ${column} DESC", "ORDER BY ${sort} DESC");
    expect(guarded).toContain(sql.present.contains);
    expect(presentIn(treeWith("guarded", { [sql.file]: guarded }), sql)).toBe(false);
  }, GIT_HEAVY_MS);

  it("keeps the run's shape applying: each pass applies with --3way after the earlier passes' seeds are injected, and ends on the seeded tree", () => {
    const built = createReplayFixture({ out: root, v1Dir: V2, units: PASS_IDS, setup: false, install: false }) as { dir: string };
    for (const id of PASSES) {
      // Throws on a hunk git cannot place, or a three-way merge left with conflicts.
      applyPatch(built.dir, join(built.dir, "vendor", "contrib", `${id}.patch`), { threeWay: true });
      const due = doc.seeds.filter((seed) => seed.pass === id);
      for (const seed of due) inject(built.dir, seed);
      // The driver commits each pass's seeds, so the next --3way reads an index that matches the tree.
      git(built.dir, ["add", "--", ...new Set(due.map((seed) => seed.file))]);
    }
    const files = git(chain.dir, ["ls-tree", "-r", "--name-only", chain.seeded]).trim().split("\n");
    for (const file of files) {
      expect(readFileSync(join(built.dir, ...file.split("/")), "utf8"), file).toBe(fileAt(chain, chain.seeded, file));
    }
  }, GIT_HEAVY_MS);

  it("locates every seed and decoy on exactly one line of the seeded tree, at its span", () => {
    expect(items).toHaveLength(15);
    for (const item of items) {
      const text = fileAt(chain, chain.seeded, item.file) as string;
      expect(text.split(item.locate.text).length - 1, `${item.id}: locate.text occurrences`).toBe(1);
      const lines = text.split("\n");
      const at = lines.findIndex((line) => line.includes(item.locate.text)) + 1;
      expect(item.span, item.id).toEqual([at + item.locate.from, at + item.locate.to]);
      expect(item.span[1], item.id).toBeLessThanOrEqual(lines.length);
    }
  });

  it("carries v1's items over, changed only by the injection, two notMatch rules and two narrowed terms", () => {
    const v1 = readDoc(V1);
    expect({ ...doc, seeds: [], decoys: [] }).toEqual({ ...v1, seeds: [], decoys: [] });
    expect(doc.decoys).toEqual(v1.decoys);
    expect(doc.seeds.map((seed) => seed.id)).toEqual(v1.seeds.map((seed) => seed.id));
    const changes: Record<string, Partial<Item>> = {
      // review/88: the clean allowlist sits inline in the `column` line, so the span stays v1's.
      "sec-sql-sort": { present: { contains: "ORDER BY ${sort} DESC", notMatch: ["\\.(has|includes)\\(\\s*sort\\s*\\)"] } },
      // The same shape as build/365: the clean name check sits beside the unchanged `readFile(join(dir, file))`.
      "sec-path-traversal": { present: { contains: "readFile(join(dir, file))", notMatch: ["(?:\\.test|basename)\\(\\s*file\\s*\\)"] } },
      // build/364: a bare `guard` credited any finding in the route file that named the bearer guard;
      // review/92: a bare `auth` credited any finding there that named `requireAuth`; review/97 keeps
      // its authorization wording by a second narrow term.
      "sec-missing-guard": { terms: ["authenticat", "authoriz", "unguarded", "401", "protect", "access control", "anyone"] },
    };
    for (const [index, seed] of doc.seeds.entries()) {
      const { injection, ...rest } = seed;
      expect(injection, seed.id).toBeDefined();
      expect(rest, seed.id).toEqual({ ...v1.seeds[index], ...changes[seed.id] });
    }
  });

  it("gives twelve seeds, three per class and two per pass, Critical exactly for security, and three to six terms an item (seven for the missing guard)", () => {
    expect(doc.seeds).toHaveLength(12);
    expect(doc.decoys).toHaveLength(3);
    const count = (key: (seed: Seed) => string) =>
      Object.fromEntries([...new Set(doc.seeds.map(key))].map((value) => [value, doc.seeds.filter((seed) => key(seed) === value).length]));
    expect(count((seed) => seed.class as string)).toEqual({ security: 3, correctness: 3, contract: 3, "test-weakening": 3 });
    expect(count((seed) => seed.pass)).toEqual(Object.fromEntries(PASSES.map((id) => [id, 2])));
    for (const seed of doc.seeds) expect(seed.severity, seed.id).toBe(seed.class === "security" ? "Critical" : "Warning");
    for (const item of items) {
      expect(item.terms.length, item.id).toBeGreaterThanOrEqual(3);
      // review/97: `auth` split into `authenticat` and `authoriz`, so the missing guard holds one term more than v1's cap.
      expect(item.terms.length, item.id).toBeLessThanOrEqual(item.id === "sec-missing-guard" ? 7 : 6);
      // A slashed term is read with the paths kept (`matchItems`), so it must itself name a path.
      for (const term of item.terms.filter((t) => t.includes("/"))) expect(term, item.id).toMatch(/^(?:\.\.\/|[\w.-]+\/[\w.-]+)$/);
    }
  });

  it("keeps any two spans in one file far enough apart that no line matches both at the line tolerance", () => {
    const tolerance = doc.matcher.lineTolerance;
    for (const [file, group] of Map.groupBy(items, (item) => item.file)) {
      const sorted = group.toSorted((a, b) => a.span[0] - b.span[0]);
      for (let index = 1; index < sorted.length; index += 1) {
        const [previous, next] = [sorted[index - 1] as Item, sorted[index] as Item];
        expect(next.span[0] - previous.span[1], `${file}: ${previous.id} and ${next.id}`).toBeGreaterThan(2 * tolerance);
      }
    }
  });

  it("adds no patch line and injects no text that names a defect, a seed or the answer key", () => {
    const telling = /\b(?:bugs?|buggy|vuln\w*|inject\w*|todo|fixme|xxx|hack\w*|unsafe|insecure|seed\w*|defects?|decoys?|planted|oracles?|traversal)\b/i;
    for (const id of PASSES) {
      const added = readFileSync(join(PATCHES, `${id}.patch`), "utf8")
        .split("\n")
        .filter((line) => line.startsWith("+") && !line.startsWith("+++"));
      expect(added.length, id).toBeGreaterThan(0);
      expect(added.filter((line) => telling.test(line)), id).toEqual([]);
    }
    for (const seed of doc.seeds) expect(seed.injection.replace, seed.id).not.toMatch(telling);
  });
});

describe("the accepted terms, read by the matcher's own matchItems", () => {
  const doc = readDoc(V2);
  const items = [...doc.seeds, ...doc.decoys];
  const byId = new Map(items.map((item) => [item.id, item]));
  const tolerance = doc.matcher.lineTolerance;

  /** The ids of the items one Warning `text` at `line` of `file` is credited to. */
  function credited(file: string, line: number, text: string): string[] {
    const { matched } = matchItems([{ file, line, severity: "Warning", text }], items, {}, { tolerance }) as { matched: Record<string, number[]> };
    return Object.entries(matched)
      .filter(([, hits]) => hits.length > 0)
      .map(([id]) => id);
  }

  it("spends no slot on a term another term of the same item already covers", () => {
    for (const item of items) {
      const lowered = item.terms.map((term) => term.toLowerCase());
      for (const [index, term] of lowered.entries()) {
        expect(lowered.filter((other, at) => at !== index && term.includes(other)), `${item.id}: ${term}`).toEqual([]);
      }
    }
  });

  // A finding a competent reviewer writes for the defect, in words other than the seeded shape's own.
  const phrasings: Record<string, string[]> = {
    "sec-sql-sort": [
      "The sort query parameter goes straight into ORDER BY; check it against a whitelist of columns.",
      "`sort` is never validated before it reaches the query.",
      "User-controlled sort is interpolated into the SQL string.",
      "SQL injection through ?sort=.",
      "There is no allowlist of sortable columns.",
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
      "The cancel route is unguarded.",
      "Unauthenticated callers can cancel any order.",
      "The cancel route skips authentication.",
    ],
    "con-event-key": ["The event now sends `id` where subscribers read `orderId`.", "Renaming the payload key breaks the audit consumer."],
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

  it("credits the missing guard for a finding about it that names requireAuth, and not for one that only names requireAuth", () => {
    // review/92: v1's bare `auth` read inside `requireAuth`, so any route-table remark was credited.
    const seed = byId.get("sec-missing-guard") as Item;
    const [line, remark] = [seed.span[0], "Every route wraps its handler in requireAuth; hoist the bearer check into the router."];
    expect(seed.terms.filter((term) => "requireauth".includes(term.toLowerCase()))).toEqual([]);
    expect(credited(seed.file, line, remark)).toEqual([]);
    const v1Terms = (readDoc(V1).seeds.find((item) => item.id === seed.id) as Item).terms;
    const { matched } = matchItems([{ file: seed.file, line, severity: "Warning", text: remark }], [{ ...seed, terms: v1Terms }], {}, { tolerance }) as {
      matched: Record<string, number[]>;
    };
    expect(matched[seed.id]).toEqual([0]);
    expect(credited(seed.file, line, "The cancel route is registered without requireAuth, so unauthenticated callers can cancel an order.")).toEqual([seed.id]);
  });

  it("credits the missing guard for a finding worded only with authorization or unauthorized", () => {
    // review/97: `authenticat` alone dropped this wording, which v1's bare `auth` credited.
    const seed = byId.get("sec-missing-guard") as Item;
    for (const text of ["There is no authorization check on the cancel route.", "An unauthorized caller can cancel an order."]) {
      expect(credited(seed.file, seed.span[0], text), text).toEqual([seed.id]);
    }
  });

  it("credits each item with its common reviewer phrasings at its span", () => {
    expect(Object.keys(phrasings).toSorted()).toEqual(items.map((item) => item.id).toSorted());
    for (const [id, texts] of Object.entries(phrasings)) {
      const item = byId.get(id) as Item;
      for (const text of texts) expect(credited(item.file, item.span[0], text), `${id}: ${text}`).toContain(id);
    }
  });

  // A finding about something else that a reviewer could place at the same lines: no item in that file may be credited.
  const unrelated: [string, string][] = [
    ["src/store/query.ts", "listOrders has no stable tiebreaker, so rows with equal created_at can repeat across pages."],
    ["src/store/paging.ts", "pageOffset can exceed Number.MAX_SAFE_INTEGER for very large sizes."],
    ["src/reports/window.ts", "Comparing timestamps as strings breaks once a stored value carries milliseconds."],
    ["src/http/routes.ts", "routes() builds a new Router on every call; build it once."],
    ["src/http/routes.ts", "The bearer guard logs the token."],
    ["src/http/routes.ts", "Every route wraps its handler in requireAuth; hoist the bearer check into the router."],
    ["src/events/emitter.ts", "The at timestamp is not checked to be ISO 8601 before serializing."],
    ["src/orders/invoice.ts", "readInvoice rethrows EACCES, which surfaces as an unhandled rejection."],
    ["src/orders/handlers.ts", "size is read with parsePositive but never capped at maxPageSize."],
    ["src/orders/handlers.ts", "toWire's doc comment promises the five keys on the wire (docs/api.md, Orders); give it an explicit return type."],
    ["src/config/load.ts", "exportBatchSize is never validated in config."],
    ["test/window.test.ts", "The FROM and UNTIL fixtures are duplicated across two tests."],
    ["test/handlers.test.ts", "The list test seeds its orders through a helper that hides the timestamps."],
  ];

  it("credits no item with an unrelated finding placed at any item's span in the same file", () => {
    for (const [file, text] of unrelated) {
      const inFile = items.filter((item) => item.file === file);
      expect(inFile.length, file).toBeGreaterThan(0);
      for (const item of inFile) expect(credited(file, item.span[0], text), `${file}:${item.span[0]}: ${text}`).toEqual([]);
    }
  });
});

describe("the v2 replay plan template", () => {
  const template = readFileSync(join(V2, "plan", "001-replay.md"), "utf8");

  it("is v1's plan, the cancel route's interface naming the guard the clean patch registers it behind", () => {
    const v1 = readFileSync(join(V1, "plan", "001-replay.md"), "utf8");
    const from = "From the patch: `POST /orders/:id/cancel` → `cancelHandler`, which sets";
    expect(v1.split(from)).toHaveLength(2);
    expect(template).toBe(v1.replace(from, "From the patch: `POST /orders/:id/cancel` → `cancelHandler`, behind `requireAuth`, which sets"));
  });

  it("holds no seeded line: no line an injection adds appears in it", () => {
    const seeds = readDoc(V2).seeds;
    // Two injections only delete (the invoice name check, the total_cents expectation); the other ten add a line.
    const addedBySeed = seeds.map((seed) => {
      const kept = new Set(seed.injection.find.split("\n").map((line) => line.trim()));
      // Bare punctuation lines (`}`, `} catch {`) say nothing a plan could leak.
      return seed.injection.replace
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => /\w{2}/.test(line) && !kept.has(line) && line !== "try {" && line !== "} catch {");
    });
    expect(addedBySeed.filter((added) => added.length > 0)).toHaveLength(10);
    seeds.forEach((seed, index) => {
      for (const line of addedBySeed[index] as string[]) expect(template, `${seed.id}: ${line}`).not.toContain(line);
    });
  });

  it("renders six unit sections in chain order, each naming its patch, chained by depends_on", () => {
    const stamp = "0123456789abcdef0123456789abcdef01234567";
    const plan = renderPlan(template, { stamp, units: PASS_IDS }) as string;
    expect(plan).toMatch(new RegExp(`^stamp: ${stamp} 2026-09-24$`, "m"));
    const sections = plan.slice(plan.indexOf("\n## Units\n")).split(/^(?=### )/m).slice(1);
    expect(sections.map((section) => /^### ([a-z0-9-]+) /.exec(section)?.[1])).toEqual([...PASSES]);
    sections.forEach((section, index) => {
      const id = PASSES[index] as string;
      expect(/^\|\s*`depends_on`\s*\|\s*(.*?)\s*\|\s*$/m.exec(section)?.[1], id).toBe(index === 0 ? "none" : PASSES[index - 1]);
      expect(section, id).toContain(`Apply \`vendor/contrib/${id}.patch\` with \`git apply --3way\`, then `);
    });
  });
});
