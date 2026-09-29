import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
// @ts-expect-error — native ESM contributor tool, outside the product package.
import { matchItems } from "../../scripts/replay/findings.mjs";
// @ts-expect-error — native ESM contributor tool, outside the product package.
import { PASS_IDS, applyPatch, createReplayFixture, dataDirOf, fixtureOptionsOf, renderPlan, seededPatchSet } from "../../scripts/replay/fixture.mjs";
// @ts-expect-error — native ESM contributor tool, outside the product package.
import { checkSeeds, presentIn } from "../../scripts/replay/measure.mjs";

/**
 * REPLAY-v3's fixture data (`evals/replay/v3/`, plan 012's v3-fixture unit, contract S1): the clean
 * chain research reads, and each pass's seeded patch, which the driver swaps in at that pass's
 * build dispatch so the unit applies its own seeds. What holds here, rule by rule (criterion 34):
 * the leaf rule (no later pass touches a seed's file), the own-hunk rule (each seed's clean text is
 * in lines its own pass's clean patch adds, its seeded text in lines the seeded patch adds), equal
 * preimage ids and equal line counts between the two patches of a pass, every line outside a seed
 * keeping its number, presence (absent on every clean state and after the reference fixes, present
 * on the seeded end), the spans, the class counts, the matcher's credit, and `seededPatchSet`.
 *
 * Git only by default; the service's gates over every cumulative seeded chain state run behind
 * `STAMITY_REPLAY_SUITE=1`. Every git call runs with an empty global config and no system config.
 */

const REPO_ROOT = resolve(import.meta.dirname, "../..");
const V3 = dataDirOf("v3") as string;
const PATCHES = join(V3, "patches");
const SEEDED = join(V3, "patches-seeded");
const PASSES = PASS_IDS as readonly string[];
const REPLAY_SUITE = process.env["STAMITY_REPLAY_SUITE"] === "1";

/** The budget of a case that spawns git a few hundred times (the Windows leg runs each spawn several times slower). */
const GIT_HEAVY_MS = 60_000;

interface Injection {
  file: string;
  find: string;
  replace: string;
}

interface Item {
  id: string;
  class?: string;
  severity?: string;
  pass: string;
  file: string;
  locate: { text: string; from: number; to: number };
  present: { contains?: string | string[]; notContains?: string | string[]; notMatch?: string[] };
  injection?: Injection;
  span: [number, number];
  terms: string[];
  oracle?: { kind: string; file: string };
}

type Seed = Item & { injection: Injection; class: string; severity: string };

interface SeedsDoc {
  schema: string;
  arrival: string;
  matcher: { lineTolerance: number; severities: string[] };
  patches: Record<string, { clean: string; seeded: string }>;
  seeds: Seed[];
  decoys: Item[];
}

const doc = JSON.parse(readFileSync(join(V3, "seeds.json"), "utf8")) as SeedsDoc;
const items: Item[] = [...doc.seeds, ...doc.decoys];
const patchText = (dir: string, id: string): string => readFileSync(join(dir, `${id}.patch`), "utf8");
const digest = (dir: string, id: string): string => createHash("sha256").update(readFileSync(join(dir, `${id}.patch`))).digest("hex");

/** One npm script in `dir`, its exit code and its whole output. */
function npm(dir: string, args: string[]): { exitCode: number | null; output: string } {
  const result = spawnSync("npm", args, { cwd: dir, encoding: "utf8", shell: process.platform === "win32" });
  return { exitCode: result.status, output: `${result.stdout ?? ""}${result.stderr ?? ""}${result.error?.message ?? ""}` };
}

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
    maxBuffer: 256 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "stamity-replay-seeds-v3-"));
  cleanGlobal = join(root, "empty.gitconfig");
  writeFileSync(cleanGlobal, "", "utf8");
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true, maxRetries: 5 });
});

/** A patch's `diff --git` blocks: path, `index` ids, and the block's text. */
function blocksOf(text: string): { path: string; pre: string; post: string; text: string }[] {
  return text
    .split(/^(?=diff --git )/m)
    .filter((block) => block.startsWith("diff --git "))
    .map((block) => {
      const path = /^diff --git a\/\S+ b\/(\S+)$/m.exec(block)?.[1] as string;
      const ids = /^index ([0-9a-f]+)\.\.([0-9a-f]+)/m.exec(block);
      return { path, pre: ids?.[1] as string, post: ids?.[2] as string, text: block };
    });
}

/** The lines a block adds, without their `+`. */
const addedLines = (block: string): string[] =>
  block
    .split("\n")
    .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
    .map((line) => line.slice(1));

/** Whether `text` stands in one run of added lines of `block`: every line of it is (part of) an added line, consecutively. */
function inAddedRun(block: string, text: string): boolean {
  const added = addedLines(block).join("\n");
  const lines = text.endsWith("\n") ? text.slice(0, -1).split("\n") : text.split("\n");
  const run = lines.join("\n");
  // A one-line fragment may sit inside an added line; a multi-line text must be whole added lines.
  return lines.length === 1 ? addedLines(block).some((line) => line.includes(run)) : `\n${added}\n`.includes(`\n${run}\n`);
}

/** `path` as it stands in `tree` of the repository at `dir`, or null when the tree has no such file. */
function fileAt(dir: string, tree: string, path: string): string | null {
  const listed = git(dir, ["ls-tree", "--name-only", tree, "--", path]).trim();
  return listed === path ? git(dir, ["cat-file", "blob", `${tree}:${path}`]) : null;
}

/** A directory holding `files` (repository-relative, POSIX) with the given contents, for `presentIn`. */
function treeWith(name: string, files: Record<string, string | null>): string {
  const dir = join(root, name);
  mkdirSync(dir, { recursive: true });
  for (const [file, text] of Object.entries(files)) {
    if (text === null) continue;
    const path = join(dir, ...file.split("/"));
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text, "utf8");
  }
  return dir;
}

/**
 * The two chains in one scratch repository: `clean[k]` is the tree after clean pass k (`clean[0]`
 * the base), `seeded[k]` the tree after seeded passes 1..k, each applied with `git apply --3way` as
 * a unit applies its swapped patch; `injected` is the clean end with every seed's `injection` over
 * it, and `fixed` the seeded end with the reference fixes over it.
 */
interface Chains {
  dir: string;
  clean: string[];
  seeded: string[];
  injected: string;
  fixed: string;
}

function buildChains(): Chains {
  const dir = join(root, "chains");
  mkdirSync(dir, { recursive: true });
  git(dir, ["init", "--quiet", "--template="]);
  const walk = (patches: string): string[] => {
    git(dir, ["read-tree", "--empty"]);
    git(dir, ["clean", "-fdxq"]);
    git(dir, ["apply", "--index", "--whitespace=nowarn", join(PATCHES, "base.patch")]);
    const trees = [git(dir, ["write-tree"]).trim()];
    for (const id of PASSES) {
      // Exits non-zero (and execFileSync throws) on a refused hunk or a merge left with conflicts.
      git(dir, ["apply", "--3way", "--whitespace=nowarn", join(patches, `${id}.patch`)]);
      git(dir, ["add", "--all"]);
      trees.push(git(dir, ["write-tree"]).trim());
    }
    return trees;
  };
  const seeded = walk(SEEDED);
  git(dir, ["apply", "--index", "--whitespace=nowarn", join(V3, "oracle", "reference-fixes.patch")]);
  const fixed = git(dir, ["write-tree"]).trim();
  const clean = walk(PATCHES);
  for (const seed of doc.seeds) {
    const path = join(dir, ...seed.injection.file.split("/"));
    writeFileSync(path, readFileSync(path, "utf8").replace(seed.injection.find, () => seed.injection.replace), "utf8");
  }
  git(dir, ["add", "--all"]);
  const injected = git(dir, ["write-tree"]).trim();
  return { dir, clean, seeded, injected, fixed };
}

/** Every item's file as it stands in `tree`, written to a directory `presentIn` reads. */
function copyOf(chains: Chains, tree: string, name: string): string {
  return treeWith(name, Object.fromEntries(items.map((item) => [item.file, fileAt(chains.dir, tree, item.file)])));
}

describe("the v3 data set's shape (contract S1)", () => {
  it("holds base.patch, six clean and six seeded patches, the plan and the two oracle patches, and nothing else", () => {
    expect(readdirSync(PATCHES).toSorted()).toEqual(["base.patch", ...PASSES.map((id) => `${id}.patch`)].toSorted());
    expect(readdirSync(SEEDED).toSorted()).toEqual(PASSES.map((id) => `${id}.patch`).toSorted());
    expect(readdirSync(V3).toSorted()).toEqual(["oracle", "patches", "patches-seeded", "plan", "seeds.json"]);
    expect(readdirSync(join(V3, "oracle")).toSorted()).toEqual(["oracles.patch", "reference-fixes.patch"]);
  });

  it("names the schema, the patch arrival, v1's matcher, and each pass's two patch digests", () => {
    expect(doc.schema).toBe("stamity/replay-seeds/v1");
    expect(doc.arrival).toBe("patch");
    expect(doc.matcher).toEqual({ lineTolerance: 3, severities: ["Critical", "Warning"] });
    expect(Object.keys(doc.patches)).toEqual([...PASSES]);
    for (const id of PASSES) expect(doc.patches[id], id).toEqual({ clean: digest(PATCHES, id), seeded: digest(SEEDED, id) });
  });

  it("passes the seeds schema check, each seed carrying the v2 fields and an injection in its own file, no decoy an injection", () => {
    expect(() => checkSeeds(doc)).not.toThrow();
    for (const seed of doc.seeds) {
      expect(Object.keys(seed).toSorted(), seed.id).toEqual(["class", "file", "id", "injection", "locate", "oracle", "pass", "present", "severity", "span", "terms"]);
      expect(Object.keys(seed.injection).toSorted(), seed.id).toEqual(["file", "find", "replace"]);
      expect(seed.injection.file, seed.id).toBe(seed.file);
      expect(seed.injection.find, seed.id).not.toBe(seed.injection.replace);
    }
    for (const decoy of doc.decoys) expect(decoy.injection, decoy.id).toBeUndefined();
  });

  it("gives twelve seeds, three per class, Critical exactly for security, three decoys, and the per-pass split 2/2/2/1/2/3", () => {
    expect(doc.seeds).toHaveLength(12);
    expect(doc.decoys.map((decoy) => decoy.id).toSorted()).toEqual(["dec-allowlist-order", "dec-internal-rename", "dec-test-reason"]);
    const count = (key: (seed: Seed) => string) => Object.fromEntries([...new Set(doc.seeds.map(key))].map((value) => [value, doc.seeds.filter((seed) => key(seed) === value).length]));
    expect(count((seed) => seed.class)).toEqual({ security: 3, correctness: 3, contract: 3, "test-weakening": 3 });
    expect(count((seed) => seed.pass)).toEqual({ "u1-p1": 2, "u1-p2": 2, "u2-p1": 2, "u2-p2": 1, "u3-p1": 2, "u3-p2": 3 });
    for (const seed of doc.seeds) expect(seed.severity, seed.id).toBe(seed.class === "security" ? "Critical" : "Warning");
  });

  it("pairs each test-weakening seed with a product seed of the same pass, in a test file that pass's clean patch adds lines to", () => {
    const weakening = doc.seeds.filter((seed) => seed.class === "test-weakening");
    expect(weakening).toHaveLength(3);
    for (const seed of weakening) {
      expect(seed.file, seed.id).toMatch(/^test\//);
      expect(doc.seeds.filter((other) => other.pass === seed.pass && other.class !== "test-weakening").length, seed.id).toBeGreaterThan(0);
      expect(addedLines(blocksOf(patchText(PATCHES, seed.pass)).find((block) => block.path === seed.file)?.text ?? "").length, seed.id).toBeGreaterThan(0);
    }
  });
});

describe("the v3 patches: leaf, own hunk, preimages, line counts", () => {
  it("keeps the leaf rule: no later pass's patch, clean or seeded, touches a seed's file", () => {
    for (const seed of doc.seeds) {
      for (const later of PASSES.slice(PASSES.indexOf(seed.pass) + 1)) {
        for (const dir of [PATCHES, SEEDED]) {
          expect(
            blocksOf(patchText(dir, later)).map((block) => block.path),
            `${seed.id}: ${later} in ${dir === PATCHES ? "patches" : "patches-seeded"}`,
          ).not.toContain(seed.file);
        }
      }
    }
  });

  it("keeps the own-hunk rule: each seed's clean text is in lines its pass's clean patch adds, its seeded text in lines the seeded patch adds", () => {
    for (const seed of doc.seeds) {
      const clean = blocksOf(patchText(PATCHES, seed.pass)).find((block) => block.path === seed.file);
      const seeded = blocksOf(patchText(SEEDED, seed.pass)).find((block) => block.path === seed.file);
      expect(clean, `${seed.id}: its pass's clean patch touches its file`).toBeDefined();
      expect(inAddedRun(clean?.text ?? "", seed.injection.find), `${seed.id}: find`).toBe(true);
      expect(inAddedRun(seeded?.text ?? "", seed.injection.replace), `${seed.id}: replace`).toBe(true);
      expect(inAddedRun(seeded?.text ?? "", seed.injection.find), `${seed.id}: no clean text left in the seeded patch`).toBe(false);
    }
  });

  it("records the same files and preimage ids in each pass's seeded patch as in its clean one", () => {
    for (const id of PASSES) {
      const pre = (dir: string) => blocksOf(patchText(dir, id)).map((block) => [block.path, block.pre]);
      expect(pre(SEEDED), id).toEqual(pre(PATCHES));
    }
  });

  it("gives each seeded patch its clean patch's line count, every line outside a seed's lines and its file's index line keeping its number and bytes", () => {
    for (const id of PASSES) {
      const [clean, seeded] = [patchText(PATCHES, id).split("\n"), patchText(SEEDED, id).split("\n")];
      expect(seeded.length, id).toBe(clean.length);
      const own = doc.seeds.filter((seed) => seed.pass === id);
      const differing = clean.flatMap((line, index) => (line === seeded[index] ? [] : [index]));
      expect(differing.length, id).toBeGreaterThan(0);
      for (const index of differing) {
        const [before, after] = [clean[index] as string, seeded[index] as string];
        const indexLine = before.startsWith("index ") && after.startsWith("index ");
        const seedLine = own.some((seed) => seed.injection.find.split("\n").some((part) => part !== "" && before.includes(part)));
        expect(indexLine || seedLine, `${id}:${index + 1}: ${before}`).toBe(true);
      }
      // Each seeded file's index line changes (its postimage differs); no other index line does.
      const changedIndex = differing.filter((index) => (clean[index] as string).startsWith("index "));
      expect(changedIndex.length, id).toBe(new Set(own.map((seed) => seed.file)).size);
    }
  });

  it("is what seededPatchSet rebuilds from the clean chain and the seeds' injections, byte for byte", () => {
    const set = seededPatchSet(V3) as Record<string, string>;
    expect(Object.keys(set)).toEqual([...PASSES]);
    for (const id of PASSES) expect(set[id] === patchText(SEEDED, id), id).toBe(true);
  }, GIT_HEAVY_MS);

  it("adds no patch line and seeds no text that names a defect, a seed or the answer key", () => {
    const telling = /\b(?:bugs?|buggy|vuln\w*|inject\w*|todo|fixme|xxx|hack\w*|unsafe|insecure|seed\w*|defects?|decoys?|planted|oracles?|traversal)\b/i;
    for (const id of PASSES) {
      for (const dir of [PATCHES, SEEDED]) {
        const added = patchText(dir, id)
          .split("\n")
          .filter((line) => line.startsWith("+") && !line.startsWith("+++"));
        expect(added.length, id).toBeGreaterThan(0);
        expect(added.filter((line) => telling.test(line)), id).toEqual([]);
      }
    }
  });
});

describe("the v3 chains", () => {
  let chains: Chains;

  beforeAll(() => {
    chains = buildChains();
  }, GIT_HEAVY_MS);

  it("applies both chains over the base with git apply --3way, every pass moving the tree", () => {
    expect(chains.clean).toHaveLength(PASSES.length + 1);
    expect(new Set(chains.clean).size).toBe(chains.clean.length);
    expect(new Set(chains.seeded).size).toBe(chains.seeded.length);
    expect(chains.seeded[0]).toBe(chains.clean[0]);
  });

  it("records on every clean index line the clean chain's own blobs", () => {
    for (const [index, id] of PASSES.entries()) {
      const [before, after] = [chains.clean[index] as string, chains.clean[index + 1] as string];
      for (const block of blocksOf(patchText(PATCHES, id))) {
        if (!/^0+$/.test(block.pre)) expect(git(chains.dir, ["rev-parse", `${before}:${block.path}`]).trim(), `${id} ${block.path}`).toBe(block.pre);
        expect(git(chains.dir, ["rev-parse", `${after}:${block.path}`]).trim(), `${id} ${block.path}`).toBe(block.post);
      }
    }
  }, GIT_HEAVY_MS);

  it("ends the seeded chain on the clean end with every injection applied, byte for byte", () => {
    expect(chains.seeded.at(-1)).toBe(chains.injected);
  });

  it("finds every seed's clean text exactly once in its file, at its own pass and at the clean end", () => {
    for (const seed of doc.seeds) {
      for (const tree of [chains.clean[PASSES.indexOf(seed.pass) + 1] as string, chains.clean.at(-1) as string]) {
        const text = fileAt(chains.dir, tree, seed.file) ?? "";
        expect(text.split(seed.injection.find).length - 1, seed.id).toBe(1);
      }
    }
  }, GIT_HEAVY_MS);

  it("reads no seed present on any clean chain state and every decoy present from its own pass on", () => {
    chains.clean.forEach((tree, state) => {
      const copy = copyOf(chains, tree, `clean-${state}`);
      for (const seed of doc.seeds) expect(presentIn(copy, seed), `${seed.id} at state ${state}`).not.toBe(true);
      for (const decoy of doc.decoys) expect(presentIn(copy, decoy) === true, `${decoy.id} at state ${state}`).toBe(state >= PASSES.indexOf(decoy.pass) + 1);
    });
  }, GIT_HEAVY_MS);

  it("reads each seed present on the seeded chain from its own pass on, and every item on the seeded end", () => {
    chains.seeded.forEach((tree, state) => {
      const copy = copyOf(chains, tree, `seeded-${state}`);
      for (const seed of doc.seeds) expect(presentIn(copy, seed) === true, `${seed.id} at state ${state}`).toBe(state >= PASSES.indexOf(seed.pass) + 1);
    });
    const end = copyOf(chains, chains.seeded.at(-1) as string, "seeded-end");
    for (const item of items) expect(presentIn(end, item), item.id).toBe(true);
  }, GIT_HEAVY_MS);

  it("reads every seed absent after the reference fixes, which give back the clean end byte for byte", () => {
    expect(chains.fixed).toBe(chains.clean.at(-1));
    const copy = copyOf(chains, chains.fixed, "fixed");
    for (const seed of doc.seeds) expect(presentIn(copy, seed), seed.id).toBe(false);
  });

  it("locates every seed and decoy on exactly one line of the seeded end, at its span", () => {
    for (const item of items) {
      const text = fileAt(chains.dir, chains.seeded.at(-1) as string, item.file) as string;
      expect(text.split(item.locate.text).length - 1, `${item.id}: locate.text occurrences`).toBe(1);
      const lines = text.split("\n");
      const at = lines.findIndex((line) => line.includes(item.locate.text)) + 1;
      expect(item.span, item.id).toEqual([at + item.locate.from, at + item.locate.to]);
      expect(item.span[1], item.id).toBeLessThanOrEqual(lines.length);
    }
  });

  it("builds a v3 fixture whose S0 tracks no vendor/, whose patches are the clean ones, ignored, and whose store holds no seed's clean text", () => {
    const built = createReplayFixture({ out: root, v1Dir: V3, units: PASS_IDS, setup: false, install: false, ...fixtureOptionsOf("v3") }) as { dir: string; baseCommit: string };
    expect(git(built.dir, ["ls-tree", "-r", "--name-only", built.baseCommit]).split("\n").filter((path) => path.startsWith("vendor/"))).toEqual([]);
    for (const id of PASSES) {
      expect(readFileSync(join(built.dir, "vendor", "contrib", `${id}.patch`), "utf8") === patchText(PATCHES, id), id).toBe(true);
      expect(spawnSync("git", ["check-ignore", "-q", `vendor/contrib/${id}.patch`], { cwd: built.dir, env: gitEnv() }).status, id).toBe(0);
    }
    expect(git(built.dir, ["status", "--porcelain"])).toBe("");
    expect(git(built.dir, ["for-each-ref", "--format=%(refname)"])).toBe("refs/heads/main\n");
    const preimageIds = PASSES.flatMap((id) => blocksOf(patchText(PATCHES, id)).map((block) => block.pre)).filter((id) => !/^0+$/.test(id));
    expect(preimageIds.length).toBeGreaterThan(10);
    for (const id of preimageIds) expect(spawnSync("git", ["cat-file", "-e", `${id}^{blob}`], { cwd: built.dir, env: gitEnv() }).status, id).toBe(0);
    const store = execFileSync("git", ["cat-file", "--batch-all-objects", "--batch"], { cwd: built.dir, env: gitEnv(), maxBuffer: 256 * 1024 * 1024 });
    expect(store.length).toBeGreaterThan(10_000);
    for (const seed of doc.seeds) expect(store.includes(Buffer.from(seed.injection.find, "utf8")), seed.id).toBe(false);
    // Non-degenerate: the store does hold the base's own lines, so the scan reads real bytes.
    expect(store.includes(Buffer.from("listOrders", "utf8"))).toBe(true);
  }, GIT_HEAVY_MS);
});

describe("the v3 spans and terms, read by the matcher's own matchItems", () => {
  const tolerance = doc.matcher.lineTolerance;
  const byId = new Map(items.map((item) => [item.id, item]));

  /** The ids of the items one `severity` finding `text` at `line` of `file` is credited to. */
  function credited(file: string, line: number, text: string, severity = "Warning"): string[] {
    const { matched } = matchItems([{ file, line, severity, text }], items, {}, { tolerance, severities: doc.matcher.severities }) as { matched: Record<string, number[]> };
    return Object.entries(matched)
      .filter(([, hits]) => hits.length > 0)
      .map(([id]) => id);
  }

  it("keeps any two spans in one file far enough apart that no line matches both at the line tolerance", () => {
    for (const [file, group] of Map.groupBy(items, (item) => item.file)) {
      const sorted = group.toSorted((a, b) => a.span[0] - b.span[0]);
      for (let index = 1; index < sorted.length; index += 1) {
        const [previous, next] = [sorted[index - 1] as Item, sorted[index] as Item];
        expect(next.span[0] - previous.span[1], `${file}: ${previous.id} and ${next.id}`).toBeGreaterThan(2 * tolerance);
      }
    }
  });

  it("gives every item three to seven terms, and spends a slot on a term another of its own covers only where named", () => {
    const covered: string[] = [];
    for (const item of items) {
      expect(item.terms.length, item.id).toBeGreaterThanOrEqual(3);
      expect(item.terms.length, item.id).toBeLessThanOrEqual(7);
      const lowered = item.terms.map((term) => term.toLowerCase());
      for (const [index, term] of lowered.entries()) {
        for (const other of lowered.filter((candidate, at) => at !== index && term.includes(candidate))) covered.push(`${item.id}: ${term} ⊇ ${other}`);
      }
    }
    // The data set as research cut it: `toBeTruthy` and `another order` never credit a finding that
    // `truthy` and `other order` would not. The unit's report raises both (two spare slots, no wrong
    // credit); any other such pair is new and fails here.
    expect(covered).toEqual(["tw-event-at-truthy: tobetruthy ⊇ truthy", "sec-invoice-other-order: another order ⊇ other order"]);
  });

  // A finding a competent reviewer writes for the defect, placed at the seed's span, at Warning.
  const phrasings: Record<string, string> = {
    "sec-sort-alternation": "The sort allowlist regex lacks a group: ^ and $ bind only to the first and last alternatives, so a value beginning with a column name reaches ORDER BY (SQL injection).",
    "tw-sort-fallback-vacuous": "The sort-fallback test is vacuous: expect(() => listOrders(...)).toBeDefined() never calls listOrders, so it passes whatever the allowlist does.",
    "cor-count-distinct": "countWithin puts the matches through a Set, so two orders created at the same instant count once: duplicate timestamps are undercounted.",
    "tw-count-loose": "The countWithin test asserts only toBeGreaterThan(0) although the data has an exact expected count.",
    "con-event-time-format": "The cancel event time uses toUTCString(), an RFC 1123 date, not the ISO 8601 UTC time the Events contract requires.",
    "tw-event-at-truthy": "expect(event.at).toBeTruthy() accepts any non-empty value; the ISO 8601 shape is no longer checked.",
    "con-config-key-case": "config/service.json misspells the key as exportBatchsize (lowercase s), so the shipped value is silently ignored and the default is used.",
    "sec-invoice-other-order": "The invoice name pattern makes the hyphen optional, so /orders/1/invoice?file=12.pdf serves another order's invoice (IDOR).",
    "cor-invoice-eacces": "EACCES is folded into the not-found branch, so an unreadable invoice answers 404 instead of the 500 a read failure should produce.",
    "sec-export-alias-unguarded": "GET /orders/export.csv is registered without requireAuth: anyone can download every order unauthenticated.",
    "cor-export-truncated": "The batch-read catch breaks the loop, so a store failure mid-export returns a truncated CSV with 200 instead of a 500.",
    "con-export-doc-header": "docs/api.md documents the export header row as id,customer,total,status,created_at, but the export writes total_cents.",
  };

  it("credits a plausible Warning finding at each seed's span to exactly that seed", () => {
    expect(Object.keys(phrasings).toSorted()).toEqual(doc.seeds.map((seed) => seed.id).toSorted());
    for (const [id, text] of Object.entries(phrasings)) {
      const seed = byId.get(id) as Item;
      expect(credited(seed.file, seed.span[0], text), `${id}: ${text}`).toEqual([id]);
    }
  });

  it("credits nothing for the same finding at Minor, the severity the matcher leaves out", () => {
    for (const [id, text] of Object.entries(phrasings)) {
      const seed = byId.get(id) as Item;
      expect(credited(seed.file, seed.span[0], text, "Minor"), id).toEqual([]);
    }
  });
});

describe("the v3 replay plan template", () => {
  const template = readFileSync(join(V3, "plan", "001-replay.md"), "utf8");

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

  it("quotes no seed's clean text and no seeded line", () => {
    for (const seed of doc.seeds) {
      expect(template.includes(seed.injection.find), `${seed.id}: find`).toBe(false);
      const kept = new Set(seed.injection.find.split("\n").map((line) => line.trim()));
      // Bare punctuation lines (`}`, `} catch {`) say nothing a plan could leak.
      const added = seed.injection.replace
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => /\w{2}/.test(line) && !kept.has(line) && line !== "} catch {");
      for (const line of added) expect(template, `${seed.id}: ${line}`).not.toContain(line);
    }
  });
});

describe.skipIf(!REPLAY_SUITE)("the v3 service's gates on every cumulative seeded chain state (set STAMITY_REPLAY_SUITE=1 to run)", () => {
  it(
    "keeps lint, typecheck and test green after every seeded pass, nothing skipped: no base, patch or plan test sees a seed",
    () => {
      const built = createReplayFixture({ out: root, v1Dir: V3, units: PASS_IDS, setup: false, depsLink: join(REPO_ROOT, "node_modules"), ...fixtureOptionsOf("v3") }) as { dir: string };
      for (const id of PASSES) {
        // The swap: the pass's patch holds its seeded bytes when the unit applies it.
        writeFileSync(join(built.dir, "vendor", "contrib", `${id}.patch`), readFileSync(join(SEEDED, `${id}.patch`)));
        applyPatch(built.dir, join(built.dir, "vendor", "contrib", `${id}.patch`), { threeWay: true });
        const lint = npm(built.dir, ["run", "lint"]);
        expect(lint.exitCode, `${id} lint\n${lint.output}`).toBe(0);
        expect(lint.output, `${id} lint`).not.toMatch(/\b(?:warning|error)\b/i);
        const typecheck = npm(built.dir, ["run", "typecheck"]);
        expect(typecheck.exitCode, `${id} typecheck\n${typecheck.output}`).toBe(0);
        const test = npm(built.dir, ["test"]);
        expect(test.exitCode, `${id} test\n${test.output}`).toBe(0);
        expect(test.output, id).toMatch(/Tests\s+\d+ passed/);
        expect(test.output, id).not.toMatch(/\bskipped\b/);
      }
      const copy = treeWith("suite-end", Object.fromEntries(items.map((item) => [item.file, readFileSync(join(built.dir, ...item.file.split("/")), "utf8")])));
      for (const seed of doc.seeds) expect(presentIn(copy, seed), seed.id).toBe(true);
    },
    900_000,
  );
});
