import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Repo root, resolved from this file rather than from the process cwd. */
export const REPO_ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));

/** Real filesystem paths are composed natively; logical paths are always displayed POSIX. */
const posix = (value: string): string => value.replaceAll("\\", "/");

export const CASES_DIR = "evals/cases-v6";
export const EXEMPTIONS_FILE = "evals/coverage-exemptions-v6.md";
export const SET_FILE = "evals/SET-v7.md";
export const RUBRIC_FILE = "evals/rubric-v7.md";
export const README_FILE = "evals/README.md";
export const RUNNER_SKILL_FILE = ".stamity/overrides/skills/st-eval-run/SKILL.md";

export const readRepoFile = (relPath: string): string =>
  readFileSync(join(REPO_ROOT, ...relPath.split("/")), "utf8");

const isDirectory = (absPath: string): boolean => statSync(absPath).isDirectory();

const isFile = (absPath: string): boolean => {
  try {
    return statSync(absPath).isFile();
  } catch {
    return false;
  }
};

/**
 * One root's artifacts: each flat class directory's `*.md` files and each skill directory's
 * SKILL.md, as `<prefix>/<dir>/<entry>` paths. A class directory the root does not carry throws
 * when `required`, since a core glob that stopped matching would silently exempt a whole class; a
 * pack carries only the classes it ships, so for a pack a missing directory is none of that class.
 */
const rootArtifacts = (absRoot: string, prefix: string, flat: readonly string[], required: boolean): string[] => {
  const found: string[] = [];
  const present = (abs: string): boolean => required || (existsSync(abs) && isDirectory(abs));
  for (const dir of flat) {
    const abs = join(absRoot, dir);
    if (!present(abs)) continue;
    for (const entry of readdirSync(abs)) {
      if (entry.endsWith(".md")) found.push(`${prefix}/${dir}/${entry}`);
    }
  }
  const skillsRoot = join(absRoot, "skills");
  if (!present(skillsRoot)) return found;
  for (const entry of readdirSync(skillsRoot)) {
    if (!isDirectory(join(skillsRoot, entry))) continue;
    // A skill directory with no SKILL.md is not an artifact of this surface; the corpus suites
    // own that shape, and skipping it here keeps this gate to coverage rather than duplicating
    // their contract.
    if (isFile(join(skillsRoot, entry, "SKILL.md"))) found.push(`${prefix}/skills/${entry}/SKILL.md`);
  }
  return found;
};

/**
 * The coverage surface the set declares, enumerated rather than matched: under `content/`, the
 * charter file, the command files, the agent files, each skill directory's SKILL.md and the rule
 * files; and under `packs/`, for every directory holding a `pack.json`, the same four classes a
 * pack may ship — its commands, agents and rules and each skill directory's SKILL.md
 * (REQ-PACK-013). A directory under `packs/` with no `pack.json` is no pack and contributes
 * nothing. `root` defaults to this repository; a test hands a temp tree.
 * Returns repo-relative POSIX paths, sorted.
 */
export const contentArtifacts = (root: string = REPO_ROOT): string[] => {
  const found = rootArtifacts(join(root, "content"), "content", ["charter", "commands", "agents", "rules"], true);
  const packsRoot = join(root, "packs");
  if (existsSync(packsRoot)) {
    for (const id of readdirSync(packsRoot)) {
      const packRoot = join(packsRoot, id);
      if (!isDirectory(packRoot) || !isFile(join(packRoot, "pack.json"))) continue;
      found.push(...rootArtifacts(packRoot, `packs/${id}`, ["commands", "agents", "rules"], false));
    }
  }
  return found.toSorted();
};

export interface CaseFile {
  /** Repo-relative POSIX path of the case file. */
  readonly path: string;
  /** Filename without the `.md` extension. */
  readonly basename: string;
  /** `golden` | `adversarial` | `probe`, taken from the directory. */
  readonly group: string;
  readonly frontmatter: ReadonlyMap<string, string>;
  readonly bodyLines: readonly string[];
  readonly raw: string;
}

/** Every case file under `evals/cases-v6/**`, sorted by path. */
export const caseFiles = (): CaseFile[] => {
  const root = join(REPO_ROOT, ...CASES_DIR.split("/"));
  const out: CaseFile[] = [];
  for (const group of readdirSync(root).toSorted()) {
    const groupDir = join(root, group);
    if (!isDirectory(groupDir)) continue;
    for (const entry of readdirSync(groupDir).toSorted()) {
      if (!entry.endsWith(".md")) continue;
      const relPath = `${CASES_DIR}/${group}/${entry}`;
      const raw = readRepoFile(relPath);
      const lines = raw.split("\n");
      const frontmatter = new Map<string, string>();
      let bodyStart = 0;
      if (lines[0] === "---") {
        const end = lines.indexOf("---", 1);
        if (end > 0) {
          for (const line of lines.slice(1, end)) {
            const match = /^([A-Za-z][A-Za-z0-9_]*):[ \t]*(.*)$/.exec(line);
            if (match) frontmatter.set(match[1] ?? "", unquote(match[2] ?? ""));
            else frontmatter.set(`__malformed__${line}`, line);
          }
          bodyStart = end + 1;
        }
      }
      out.push({
        path: relPath,
        basename: entry.slice(0, -3),
        group,
        frontmatter,
        bodyLines: lines.slice(bodyStart),
        raw,
      });
    }
  }
  return out;
};

const unquote = (value: string): string => {
  const trimmed = value.trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
};

export interface ParsedSource {
  readonly path: string;
  readonly ranges: ReadonlyArray<readonly [number, number]>;
}

/**
 * True when a source path sits under one of the surface's two roots, `content/` or `packs/`, whose
 * artifacts the coverage sum accounts for. The runner's `case-source` admission is the same rule
 * (`isSurfaceSource` in `scripts/eval/instrument.mjs`); `coverage.test.ts` holds the two equal.
 */
export const isSurfaceSource = (path: string): boolean => path.startsWith("content/") || path.startsWith("packs/");

/**
 * `path/to/file.md:12-30` or `path/to/file.md:12-30,44-51`. Returns null on any shape the
 * contract does not admit, so the caller reports the case rather than silently skipping it.
 * Markdown only: the one other shape, a `scripts/plugins/` module that rendered the plugin
 * root's generated `st-setup` body, left with the plugin route on 2026-10-14.
 */
export const parseSource = (value: string): ParsedSource | null => {
  const match = /^([^\s:]+\.md):((?:\d+(?:-\d+)?)(?:,\d+(?:-\d+)?)*)$/.exec(value.trim());
  if (!match) return null;
  const path = posix(match[1] ?? "");
  const ranges = (match[2] ?? "").split(",").map((part) => {
    const [from, to] = part.split("-");
    return [Number(from), Number(to ?? from)] as const;
  });
  return { path, ranges };
};

/**
 * The surface artifact path each case's `source:` names, deduplicated. A case governed outside
 * `content/**` and `packs/**` contributes nothing here: the sum compares sourced ∪ exempted against
 * the surface's artifact count, and folding another file in would inflate it by a file no
 * enumeration produces. `coverage.test.ts` lists those cases as governed outside both instead.
 */
export const sourcedArtifacts = (cases: readonly CaseFile[]): Set<string> => {
  const out = new Set<string>();
  for (const file of cases) {
    const parsed = parseSource(file.frontmatter.get("source") ?? "");
    if (parsed && isSurfaceSource(parsed.path)) out.add(parsed.path);
  }
  return out;
};

/** The artifact paths the exemption file lists, one per `### \`<path>\`` heading. */
export const exemptedArtifacts = (): string[] => {
  const out: string[] = [];
  for (const line of readRepoFile(EXEMPTIONS_FILE).split("\n")) {
    const match = /^### `([^`]+)`\s*$/.exec(line);
    if (match) out.push(posix(match[1] ?? ""));
  }
  return out;
};
