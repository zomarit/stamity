import { execFileSync, spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, posix, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import {
  buildContentIndex,
  COMMAND_ID_PREFIX,
  type CatalogItem,
} from "../../src/content/catalog.ts";
import { parseFrontmatter } from "../../src/content/frontmatter.ts";
import { demotedRuleIds, ruleDeliveryInputOf } from "../../src/content/ruleDelivery.ts";
import { CONTENT_CLASSES, type ContentClass } from "../../src/types/content.ts";
import { RULE_DELIVERY_DEFAULT } from "../../src/types/manifest.ts";
import { contentPrefixFor } from "../../src/types/markers.ts";

/**
 * The drift gate on the fifth published surface: the APM package.
 *
 * The four plugin manifests POINT at `content/`; an APM package COPIES it,
 * because `apm.yml` with no `.apm/` directory is a hard validation error and
 * APM addresses a primitive by where it sits in that tree. A copy is the drift
 * class the other four were built to end, arriving in its worst form — so the
 * generator projects every byte and this suite pins the properties a
 * regeneration could still get wrong.
 *
 * Four groups, each answering a different question:
 *
 *   the generator   deterministic (two runs, one byte sequence), `--check`
 *                   green on the committed tree, RED on a seeded edit, and RED
 *                   on an UNEXPECTED primitive. The last one is this surface's
 *                   own hazard and has no analogue among the manifests: the
 *                   file set follows the corpus, so a retired artifact leaves a
 *                   file that no byte-diff over the rendered set would ever
 *                   read. A `--check` that only compared what it rendered would
 *                   be green on a package shipping a skill the corpus dropped.
 *   the manifest    parses, carries APM's two REQUIRED fields with the values
 *                   package.json holds, and omits — by name — every field the
 *                   probe verified is not a top-level `apm.yml` key or is a
 *                   decision nobody took. The omissions are asserted because
 *                   the byte-diff cannot: it pins whatever was committed,
 *                   including a field that should never have been there.
 *   layout          every content class lands in the directory and under the
 *                   file-suffix APM discovers it by, under the SAME emitted id
 *                   every other client surface uses, and a skill's directory
 *                   name is its identity. A fifth content class fails here
 *                   rather than shipping a package that silently drops it.
 *   frontmatter     each primitive carries the keys its class's reference
 *                   documents and NOT the engine's authoring vocabulary, and
 *                   the body is the corpus body byte-for-byte.
 *
 * WHAT THIS SUITE DOES NOT ANSWER, now that there is a suite that does. Every
 * group above is about the package's BYTES, and bytes are only half of a
 * published surface. Through apm 0.29.0 this projection was byte-perfect and
 * installed NOTHING: the type-detection cascade ranked the repository's root
 * `plugin.json` ahead of `apm.yml` + `.apm/`, so `apm install` typed the tree
 * as an Agent Plugin, exited 0, and deployed zero primitives. Everything below
 * was green throughout, correctly — the bytes it compares were right.
 *
 * That gap closed twice over. Upstream: microsoft/apm#2735, fixed by PR #2776
 * and shipped in apm 0.29.1, which puts an eligible `apm.yml` at the head of
 * the cascade, so this repository routes to APM with both plugin surfaces
 * present and nothing stripped. Here: the ROUTE is now gated by
 * `test/ci/apmInstall.test.ts` and `scripts/apm-install-smoke.mjs`, which
 * install into a real consumer and read the deployed tree. The division is
 * deliberate — this suite proves the package is what the corpus says, that one
 * proves a consumer receives it — and neither can stand in for the other.
 */

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SCRIPT_PATH = join(REPO_ROOT, "scripts/generate-apm-package.mjs");

/** The manifest at the repository root, which is the package root APM resolves. */
const APM_MANIFEST = "apm.yml";

/** The primitive tree, whose presence is what makes `apm.yml` a valid package. */
const APM_DIR = ".apm";

/** Class -> the `.apm/` subdirectory APM discovers that primitive in. */
const APM_SUBDIR: Readonly<Record<ContentClass, string>> = {
  rule: "instructions",
  skill: "skills",
  command: "prompts",
  agent: "agents",
};

/** Class -> the file suffix APM's discovery glob matches. A skill has none: it is a directory. */
const APM_SUFFIX: Readonly<Record<ContentClass, string | null>> = {
  rule: ".instructions.md",
  command: ".prompt.md",
  agent: ".agent.md",
  skill: null,
};

/**
 * Frontmatter keys each class is allowed to carry, exactly.
 *
 * Asserted as an exact set rather than a subset, because both directions are
 * defects with different consequences. A MISSING key drops a field APM's
 * reference calls required. An EXTRA key is the engine's authoring vocabulary
 * (`id`, `type`, `tags`, `load`, `obsolete_when`, `capabilities`,
 * `model_class`) leaking into a consumer's package, where APM drops it at
 * compile time and reports the drop as a diagnostic — a wall of warnings about
 * keys that were never the consumer's to read.
 */
const APM_FRONTMATTER: Readonly<Record<ContentClass, readonly string[]>> = {
  rule: ["applyTo", "description"],
  skill: ["description", "name"],
  command: ["description"],
  agent: ["description", "name"],
};

/**
 * Fields `apm.yml` must NOT carry, and why each one is a claim rather than an
 * omission. Verified against apm 0.29.0 in-tree on 2026-08-31.
 */
const REFUSED_MANIFEST_FIELDS: readonly [string, string][] = [
  ["homepage", "a marketplace-block field, not a top-level apm.yml key"],
  ["repository", "a marketplace-block field, not a top-level apm.yml key"],
  ["keywords", "a marketplace-block field, not a top-level apm.yml key"],
  ["targets", "omission means auto-detect; a declared list DROPS every unlisted harness"],
  ["target", "the legacy singular spelling of the same claim"],
  ["$schema", "pinning the versioned contract is a trade-off nobody took"],
];

interface PackageJson {
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly license: string;
}

const pkg = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf-8")) as PackageJson;

/** The package id every published surface carries: the package name, unscoped. */
const PACKAGE_ID = pkg.name.replace(/^@[^/]+\//, "");

const readText = (base: string, relPath: string): string =>
  readFileSync(join(base, relPath), "utf-8");

/** Every regular file under `dir`, as POSIX paths relative to `base`, sorted. */
function walk(base: string, dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const child = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...walk(base, child));
    else if (entry.isFile()) found.push(relative(base, child).split(sep).join("/"));
  }
  return found.toSorted();
}

/** The whole generated surface at `base`: the manifest plus every primitive. */
const packageFiles = (base: string): string[] =>
  [APM_MANIFEST, ...walk(base, join(base, APM_DIR))].toSorted();

/**
 * `apm.yml` as a flat key -> raw-value map, parsed without a YAML library on
 * purpose: the assertions below are about which keys are present, and a parser
 * that tolerates a nested block would let a `marketplace:` block smuggle one of
 * the refused names back in as a top-level-looking line.
 */
function manifestKeys(base: string): Map<string, string> {
  const keys = new Map<string, string>();
  for (const line of readText(base, APM_MANIFEST).split("\n")) {
    const match = /^([A-Za-z$][\w$-]*):[ \t]*(.*)$/.exec(line);
    if (match !== null) keys.set(match[1] as string, (match[2] as string).trim());
  }
  return keys;
}

/** The emitted id one artifact projects under — the same one every client surface uses. */
function emittedId(item: { type: ContentClass; id: string }): string {
  const bare =
    item.type === "command" && item.id.startsWith(COMMAND_ID_PREFIX)
      ? item.id.slice(COMMAND_ID_PREFIX.length)
      : item.id;
  const prefix = contentPrefixFor(item);
  return bare.startsWith(prefix) ? bare : `${prefix}${bare}`;
}

const corpus = async (): Promise<CatalogItem[]> => {
  const index = await buildContentIndex();
  return index.items.filter((item) => (item.origin ?? "corpus") === "corpus");
};

/**
 * The rules this package ships as SKILLS rather than as instructions, read from
 * the engine's own delivery predicate exactly as the generator reads it.
 *
 * ADDED 2026-09-15 with the `on-demand` default. An APM instruction attaches on
 * `applyTo`, so a rule with no globs takes `**` — every file, every session,
 * which is the unconditional load the rule-delivery option exists to reclaim.
 * The generator therefore routes those rules to `.apm/skills/stamity-<id>/`,
 * and this suite has to agree about WHICH rules those are; deriving both from
 * `demotedRuleIds` is what stops the two from disagreeing. `copilot` is the
 * tool because APM's instruction layer is the surface its consumers compile to,
 * which is the same argument the generator's comment carries.
 */
const demotedRules = async (): Promise<ReadonlySet<string>> =>
  demotedRuleIds(
    "copilot",
    (await corpus()).filter((item) => item.type === "rule").map(ruleDeliveryInputOf),
    RULE_DELIVERY_DEFAULT,
  );

/** Where one artifact lands under `.apm/`, delivery included. */
function apmPathOf(item: CatalogItem, demoted: ReadonlySet<string>): string {
  const id = emittedId(item);
  if (item.type === "skill" || (item.type === "rule" && demoted.has(item.id))) {
    return posix.join(APM_DIR, APM_SUBDIR.skill, id, "SKILL.md");
  }
  return posix.join(APM_DIR, APM_SUBDIR[item.type], `${id}${APM_SUFFIX[item.type] ?? ""}`);
}

/** The frontmatter keys one artifact's primitive carries, delivery included. */
const apmFrontmatterOf = (item: CatalogItem, demoted: ReadonlySet<string>): readonly string[] =>
  item.type === "rule" && demoted.has(item.id) ? APM_FRONTMATTER.skill : APM_FRONTMATTER[item.type];

/**
 * The declared glob scope of one artifact, trimmed and deduplicated in
 * declaration order — the same derivation the generator and the Copilot
 * instructions surface both apply to `globs:` frontmatter.
 */
function globsOf(item: CatalogItem): string[] {
  const declared = item.frontmatter["globs"];
  const raw =
    typeof declared === "string"
      ? declared.split(",")
      : Array.isArray(declared)
        ? declared.filter((entry): entry is string => typeof entry === "string")
        : [];
  const globs = new Set<string>();
  for (const glob of raw) {
    const value = glob.trim();
    if (value !== "") globs.add(value);
  }
  return [...globs];
}

describe("scripts/generate-apm-package.mjs", () => {
  const workspace = mkdtempSync(join(tmpdir(), "stamity-apm-package-"));
  afterAll(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  const runInto = (dir: string): Map<string, string> => {
    execFileSync(process.execPath, [SCRIPT_PATH, "--out-dir", dir], { encoding: "utf-8" });
    return new Map(packageFiles(dir).map((relPath) => [relPath, readText(dir, relPath)]));
  };

  it("writes the whole package, and a second run produces the same bytes", () => {
    const first = runInto(workspace);
    expect(first.size, "the generator produced no files").toBeGreaterThan(0);
    expect([...runInto(workspace)]).toEqual([...first]);
    // And those bytes are the committed ones: a generator that is deterministic
    // about the wrong output is still a stale tree. The FILE SET is compared
    // first, so an artifact added to or dropped from the corpus fails as the
    // one-line set difference it is rather than as a missing-file read.
    expect([...first.keys()], "the committed package holds a different file set").toEqual(
      packageFiles(REPO_ROOT),
    );
    for (const [relPath, bytes] of first) {
      expect(bytes, `${relPath} is stale — regenerate it and commit the diff`).toBe(
        readText(REPO_ROOT, relPath),
      );
    }
  });

  it("passes --check against the committed package", () => {
    const result = spawnSync(process.execPath, [SCRIPT_PATH, "--check"], {
      cwd: REPO_ROOT,
      encoding: "utf-8",
    });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain(`${PACKAGE_ID}@${pkg.version}`);
  });

  it("fails --check on a seeded edit, naming the file and the repair", () => {
    // A copy, so the gate is proven against drift the committed tree never
    // holds. Seeding the real files would leave the repository dirty if this
    // case failed part-way.
    const seeded = mkdtempSync(join(tmpdir(), "stamity-apm-drift-"));
    try {
      for (const relPath of packageFiles(REPO_ROOT)) {
        mkdirSync(dirname(join(seeded, relPath)), { recursive: true });
        cpSync(join(REPO_ROOT, relPath), join(seeded, relPath));
      }
      writeFileSync(
        join(seeded, APM_MANIFEST),
        readText(seeded, APM_MANIFEST).replace(`version: ${pkg.version}`, "version: 0.0.0-drift"),
      );

      const result = spawnSync(process.execPath, [SCRIPT_PATH, "--check", "--out-dir", seeded], {
        cwd: REPO_ROOT,
        encoding: "utf-8",
      });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(APM_MANIFEST);
      expect(result.stderr).toContain("0.0.0-drift");
      expect(result.stderr).toContain("node scripts/generate-apm-package.mjs");
    } finally {
      rmSync(seeded, { recursive: true, force: true });
    }
  });

  it("fails --check on a primitive the corpus does not project", () => {
    // The hazard this surface has and the manifests do not. A comparison over
    // the RENDERED set alone is green on a package that still ships a skill the
    // corpus retired, because nothing in that set names the leftover file.
    const orphaned = mkdtempSync(join(tmpdir(), "stamity-apm-orphan-"));
    try {
      for (const relPath of packageFiles(REPO_ROOT)) {
        mkdirSync(dirname(join(orphaned, relPath)), { recursive: true });
        cpSync(join(REPO_ROOT, relPath), join(orphaned, relPath));
      }
      const orphan = join(APM_DIR, APM_SUBDIR.skill, "st-retired", "SKILL.md");
      mkdirSync(dirname(join(orphaned, orphan)), { recursive: true });
      writeFileSync(join(orphaned, orphan), "---\nname: st-retired\n---\n\nleftover\n");

      const result = spawnSync(process.execPath, [SCRIPT_PATH, "--check", "--out-dir", orphaned], {
        cwd: REPO_ROOT,
        encoding: "utf-8",
      });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("st-retired");
      expect(result.stderr).toContain("node scripts/generate-apm-package.mjs");
    } finally {
      rmSync(orphaned, { recursive: true, force: true });
    }
  });

  it("reports a missing package rather than treating absence as agreement", () => {
    const empty = mkdtempSync(join(tmpdir(), "stamity-apm-absent-"));
    try {
      const result = spawnSync(process.execPath, [SCRIPT_PATH, "--check", "--out-dir", empty], {
        cwd: REPO_ROOT,
        encoding: "utf-8",
      });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(APM_MANIFEST);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});

describe("apm.yml", () => {
  it("sits at the package root, beside the .apm/ tree that makes it valid", () => {
    // `apm.yml` with no `.apm/` directory is refused outright: "Not a valid APM
    // package: <name> has apm.yml but is missing the required .apm/ directory"
    // (apm 0.29.0). The manifest alone is not a lighter version of this
    // surface — it is an invalid one.
    expect(statSync(join(REPO_ROOT, APM_MANIFEST)).isFile()).toBe(true);
    expect(statSync(join(REPO_ROOT, APM_DIR)).isDirectory()).toBe(true);
  });

  it("carries the two required fields with the values package.json holds", () => {
    // `name` and `version` are the ONLY required fields, and the parser raises
    // on an absent, empty, or non-string value for either.
    const keys = manifestKeys(REPO_ROOT);
    expect(keys.get("name")).toBe(PACKAGE_ID);
    expect(keys.get("version")).toBe(pkg.version);
  });

  it("repeats package.json's description and license rather than re-wording them", () => {
    const keys = manifestKeys(REPO_ROOT);
    expect(keys.get("description")).toBe(pkg.description);
    expect(keys.get("license")).toBe(pkg.license);
  });

  it("omits every field the probe verified is not a top-level key or is an untaken decision", () => {
    // Stated by NAME, because the byte-diff above cannot notice: it pins
    // whatever was committed, a field that should never have been there
    // included. Each entry carries the reason, so adding one has to be a
    // deliberate edit backed by evidence rather than a plausible-looking key.
    const keys = manifestKeys(REPO_ROOT);
    for (const [field, reason] of REFUSED_MANIFEST_FIELDS) {
      expect(keys.has(field), `apm.yml declares \`${field}\`: ${reason}`).toBe(false);
    }
  });

  it("declares the content type as the inert value it is", () => {
    // `type` is accepted and still drives nothing. Re-read at apm 0.30.0 on
    // 2026-09-09: the value is now parsed into a validated four-member enum, so
    // a typo here is a hard parse error rather than a silent no-op — but the
    // routing its own docstring describes derives the content type from the
    // DETECTED package type and never reads the manifest's declaration
    // (integration/skill_package_routing.py). `hybrid` is what will be true of
    // this package when it becomes live: both instructions compilation and
    // skill installation.
    expect(manifestKeys(REPO_ROOT).get("type")).toBe("hybrid");
  });
});

describe("APM package layout", () => {
  it("lands every content class in the directory APM discovers it in", async () => {
    const items = await corpus();
    const demoted = await demotedRules();
    for (const contentClass of CONTENT_CLASSES) {
      const projected = items.filter((item) => item.type === contentClass);
      expect(projected.length, `the corpus indexes no ${contentClass}`).toBeGreaterThan(0);
      for (const item of projected) {
        const relPath = apmPathOf(item, demoted);
        expect(
          statSync(join(REPO_ROOT, relPath)).isFile(),
          `${item.id} (${contentClass}) does not project to ${relPath}`,
        ).toBe(true);
      }
    }
    // Non-degenerate on the delivery axis: BOTH rule homes are occupied, so a
    // generator that routed every rule one way fails here rather than passing
    // with a `demoted` set the helper happened to agree with.
    const rules = items.filter((item) => item.type === "rule");
    expect(rules.filter((item) => demoted.has(item.id)).length).toBeGreaterThan(0);
    expect(rules.filter((item) => !demoted.has(item.id)).length).toBeGreaterThan(0);
  });

  it("names every primitive with the emitted id every other client surface uses", async () => {
    // The prefix split is the point: `st-` on the invocable classes, `stamity-`
    // on the rest. An APM consumer types the same `/st-work` and addresses the
    // same `stamity-reviewer` as a consumer on any other channel, so a
    // projection that re-derived its own spelling would be a fifth vocabulary
    // for one corpus.
    const items = await corpus();
    for (const item of items) {
      const id = emittedId(item);
      expect(id.startsWith(item.type === "command" || item.type === "skill" ? "st-" : "stamity-"))
        .toBe(true);
    }
    const commands = readdirSync(join(REPO_ROOT, APM_DIR, APM_SUBDIR.command));
    const agents = readdirSync(join(REPO_ROOT, APM_DIR, APM_SUBDIR.agent));
    for (const name of commands) expect(name.startsWith("st-"), name).toBe(true);
    for (const name of agents) expect(name.startsWith("stamity-"), name).toBe(true);
  });

  it("gives a skill its whole source directory, references included", async () => {
    // `SKILL.md` is the only required file, and a skill's body links its
    // `references/` material by path. Projecting the head alone ships a
    // document whose own links resolve to nothing.
    const items = await corpus();
    const skills = items.filter((item) => item.type === "skill");
    const withReferences = skills.filter((item) =>
      existsUnderCorpus(posix.join(posix.dirname(item.relativePath), "references")),
    );
    expect(withReferences.length, "no skill in the corpus ships references/").toBeGreaterThan(0);

    for (const item of withReferences) {
      const sourceDir = join(REPO_ROOT, "content", ...posix.dirname(item.relativePath).split("/"));
      const target = join(REPO_ROOT, APM_DIR, APM_SUBDIR.skill, emittedId(item));
      const sources = walk(sourceDir, sourceDir).filter((rel) => rel !== "SKILL.md");
      for (const rel of sources) {
        expect(
          readText(target, rel),
          `${rel} is not the byte-for-byte reference the corpus ships`,
        ).toBe(readText(sourceDir, rel));
      }
    }
  });

  it("holds nothing beyond the manifest and the four primitive directories", () => {
    // A fifth directory under `.apm/` is a content class this surface grew
    // without anyone deciding to ship it — hooks, context, and a lockfile are
    // each named out of scope in the generator's header, and the assertion is
    // what keeps that statement true.
    const present = readdirSync(join(REPO_ROOT, APM_DIR)).toSorted();
    expect(present).toEqual(Object.values(APM_SUBDIR).toSorted());
  });
});

describe("APM primitive frontmatter", () => {
  it("carries the keys its class documents, and none of the engine's own", async () => {
    const items = await corpus();
    const demoted = await demotedRules();
    for (const item of items) {
      const relPath = apmPathOf(item, demoted);
      const parsed = parseFrontmatter(readText(REPO_ROOT, relPath), relPath);
      expect(parsed.hadFrontmatter, `${relPath} declares no frontmatter`).toBe(true);
      // A demoted rule carries the SKILLS head — `name` plus `description`, no
      // `applyTo` — because it is discovered as a skill. The keys follow the
      // home, not the authoring class.
      expect(Object.keys(parsed.frontmatter).toSorted(), relPath).toEqual([
        ...apmFrontmatterOf(item, demoted),
      ]);
      expect(parsed.frontmatter["description"], relPath).toBe(item.description);
      // The body is a COPY, not a re-render: a projection that reflowed or
      // re-substituted it would be a second author for one document.
      expect(parsed.body, `${relPath} is not the corpus body`).toBe(item.body);
    }
  });

  // REWRITTEN 2026-09-15. This case used to assert that a rule with no globs
  // takes `applyTo: "**"` — "unconditional, and `**` is how that is spelled
  // here". The engine stopped shipping that spelling: a glob-less rule is no
  // longer an instruction at all, because `**` was never a scope, it was every
  // file on every session, and the delivery option reclaims exactly that. The
  // claim splits in two, and both halves are asserted, so nothing the old case
  // covered is now uncovered: a glob-scoped rule still round-trips its globs
  // into `applyTo`, and a glob-less one is somewhere else entirely.
  it("scopes an instruction with applyTo, and delivers a glob-less rule as a skill instead", async () => {
    const items = await corpus();
    const demoted = await demotedRules();
    const rules = items.filter((item) => item.type === "rule");
    expect(
      rules.filter((item) => globsOf(item).length === 0).length,
      "no rule in the corpus is unconditional",
    ).toBeGreaterThan(0);
    expect(
      rules.filter((item) => globsOf(item).length > 0).length,
      "no rule in the corpus is glob-scoped",
    ).toBeGreaterThan(0);

    for (const item of rules) {
      const globs = globsOf(item);
      const instruction = posix.join(
        APM_DIR,
        APM_SUBDIR.rule,
        `${emittedId(item)}${APM_SUFFIX.rule ?? ""}`,
      );
      if (globs.length === 0) {
        // The delivery predicate and the glob count agree for this client, which
        // is the invariant that makes the two branches below exhaustive.
        expect(demoted.has(item.id), item.id).toBe(true);
        expect(existsSync(join(REPO_ROOT, instruction)), instruction).toBe(false);
        const skill = apmPathOf(item, demoted);
        const head = parseFrontmatter(readText(REPO_ROOT, skill), skill).frontmatter;
        expect(head["name"], skill).toBe(emittedId(item));
        expect(head["applyTo"], skill).toBeUndefined();
        continue;
      }
      expect(demoted.has(item.id), item.id).toBe(false);
      const applyTo = parseFrontmatter(readText(REPO_ROOT, instruction), instruction).frontmatter[
        "applyTo"
      ];
      expect(applyTo, instruction).toBe(globs.join(","));
      // `**` is now a value no instruction in this package carries, which is the
      // whole of what the delivery change did to this surface.
      expect(applyTo, instruction).not.toBe("**");
    }
  });

  it("names a skill after its directory, which is the identity APM deploys under", async () => {
    // APM refuses a package whose `SKILL.md` `name` disagrees with its
    // directory, and deploys under the directory name regardless. The two
    // spellings therefore have to be one derivation, not two.
    const items = await corpus();
    for (const item of items.filter((entry) => entry.type === "skill")) {
      const id = emittedId(item);
      const relPath = posix.join(APM_DIR, APM_SUBDIR.skill, id, "SKILL.md");
      expect(parseFrontmatter(readText(REPO_ROOT, relPath), relPath).frontmatter["name"]).toBe(id);
      expect(posix.basename(posix.dirname(item.relativePath))).toBe(id);
    }
  });

  it("names an agent after its filename stem, the id APM defaults to", async () => {
    const items = await corpus();
    for (const item of items.filter((entry) => entry.type === "agent")) {
      const id = emittedId(item);
      const relPath = posix.join(APM_DIR, APM_SUBDIR.agent, `${id}${APM_SUFFIX.agent ?? ""}`);
      expect(parseFrontmatter(readText(REPO_ROOT, relPath), relPath).frontmatter["name"]).toBe(id);
    }
  });
});

/** True when `relativePath` (corpus-relative, POSIX) exists under `content/`. */
function existsUnderCorpus(relativePath: string): boolean {
  try {
    return statSync(join(REPO_ROOT, "content", ...relativePath.split("/"))).isDirectory();
  } catch {
    return false;
  }
}
