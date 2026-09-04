import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Repo root, resolved from this file rather than from the process cwd. */
export const REPO_ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));

/** Real filesystem paths are composed natively; logical paths are always displayed POSIX. */
const posix = (value: string): string => value.replaceAll("\\", "/");

export const CASES_DIR = "evals/cases-v4";
export const EXEMPTIONS_FILE = "evals/coverage-exemptions-v4.md";
export const SET_FILE = "evals/SET-v4.md";
export const RUBRIC_FILE = "evals/rubric-v4.md";
export const README_FILE = "evals/README.md";
export const RUNNER_SKILL_FILE = ".stamity/overrides/skills/st-eval-run/SKILL.md";

export const readRepoFile = (relPath: string): string =>
  readFileSync(join(REPO_ROOT, ...relPath.split("/")), "utf8");

const isDirectory = (absPath: string): boolean => statSync(absPath).isDirectory();

/**
 * The five artifact globs the set declares as its coverage surface, enumerated
 * rather than matched: the charter file, the nine command files, the ten agent
 * files, each skill directory's SKILL.md, and the rule files.
 * Returns repo-relative POSIX paths, sorted.
 */
export const contentArtifacts = (): string[] => {
  const found: string[] = [];
  for (const dir of ["charter", "commands", "agents", "rules"]) {
    const abs = join(REPO_ROOT, "content", dir);
    for (const entry of readdirSync(abs)) {
      if (entry.endsWith(".md")) found.push(`content/${dir}/${entry}`);
    }
  }
  const skillsRoot = join(REPO_ROOT, "content", "skills");
  for (const entry of readdirSync(skillsRoot)) {
    const abs = join(skillsRoot, entry);
    if (!isDirectory(abs)) continue;
    const skillFile = join(abs, "SKILL.md");
    try {
      if (statSync(skillFile).isFile()) found.push(`content/skills/${entry}/SKILL.md`);
    } catch {
      // A skill directory with no SKILL.md is not an artifact of this surface; the
      // corpus suites own that shape, and swallowing it here keeps this gate to
      // coverage rather than duplicating their contract.
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

/** Every case file under `evals/cases-v4/**`, sorted by path. */
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
 * `path/to/file.md:12-30` or `path/to/file.md:12-30,44-51`. Returns null on any
 * shape the contract does not admit, so the caller reports the case rather than
 * silently skipping it.
 */
export const parseSource = (value: string): ParsedSource | null => {
  const match = /^([^\s:]+\.md):((?:\d+(?:-\d+)?)(?:,\d+(?:-\d+)?)*)$/.exec(value.trim());
  if (!match) return null;
  const ranges = (match[2] ?? "").split(",").map((part) => {
    const [from, to] = part.split("-");
    return [Number(from), Number(to ?? from)] as const;
  });
  return { path: posix(match[1] ?? ""), ranges };
};

/** The artifact path each case's `source:` names, deduplicated. */
export const sourcedArtifacts = (cases: readonly CaseFile[]): Set<string> => {
  const out = new Set<string>();
  for (const file of cases) {
    const parsed = parseSource(file.frontmatter.get("source") ?? "");
    if (parsed) out.add(parsed.path);
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
