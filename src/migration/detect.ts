import { readFile, readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { detectMonorepoPackages } from "../detect/repoAnalyzer.ts";

/**
 * Guided migration, half one: find out whether this repo was set up by the
 * predecessor project, and report exactly what it left behind.
 *
 * This module and its sibling `./carry.ts` are the only place in the repo
 * permitted to spell the predecessor's name. Everything downstream consumes the
 * {@link PredecessorState} record instead, so the literal never spreads: the
 * leak gate (`scripts/leak-gate.mjs`) allowlists exactly
 * `src/migration/` and `test/migration/`, and a marker string anywhere else is a
 * build failure.
 *
 * Detection is read-only and best-effort. It never creates a directory to learn
 * that one is absent, it never validates the predecessor manifest against that
 * project's schema — the manifest is read field-by-field by
 * `./carry.ts::mapPredecessorDefaults`, so a manifest we cannot parse costs the
 * operator their old defaults, not the migration — and no single unreadable file
 * fails the pass. The one thing it does decide is whether the repo has a
 * predecessor at all: `null` means there is nothing to offer, and the caller
 * shows no migration moment.
 *
 * The marker set below is the resolved form of a silence in the spec: the
 * predecessor wrote managed blocks in three comment syntaxes, optionally
 * carrying a version stamp on the BEGIN line, into a fixed set of tool
 * instruction files. Both halves — the syntaxes and the candidate files — live
 * here as the single source of truth for the strip parser in `./carry.ts`.
 *
 * ## A monorepo is more than its root
 *
 * The predecessor fans its output into each workspace package — a state
 * directory and its own instruction files per package — so a scan that resolved
 * one root and looked for `<root>/.hatch3r` answered "nothing to migrate" for a
 * repository carrying it in twelve places. The migrant then got no migration
 * moment at all and a panel that reported success. Every candidate below is now
 * scanned once per detected workspace package as well as at the root, packages
 * holding their own state directory are reported in
 * {@link PredecessorState.packagesWithState}, and package-level evidence alone
 * is enough to return a state.
 */

// ── Predecessor layout ───────────────────────────────────────────

/*
 * The layout constants below stay module-private: a caller that needs to *show*
 * one of these names reads it off the resolved path in {@link PredecessorState}
 * (`basename(state.stateDirPath)`), which is what keeps the name from spreading
 * past the two allowlisted directories. Export one only when a consumer has a
 * use the state record genuinely cannot serve.
 */

/** State directory the predecessor wrote at the repo root. */
const PREDECESSOR_STATE_DIR = ".hatch3r";

/** Manifest file inside {@link PREDECESSOR_STATE_DIR}; schema generation 3. */
const PREDECESSOR_MANIFEST_FILE = "hatch.json";

/** Learnings directory inside {@link PREDECESSOR_STATE_DIR}. */
const PREDECESSOR_LEARNINGS_DIR = "learnings";

/**
 * Per-artifact override directory inside {@link PREDECESSOR_STATE_DIR}.
 * Reported only: overrides are salvage-as-user-space, never auto-mapped onto
 * this engine's artifacts, because the two artifact ids are not the same set.
 */
const PREDECESSOR_OVERRIDES_DIR = "overrides";

/** MCP credential file at the repo root. Same name this engine uses. */
const PREDECESSOR_ENV_MCP_FILE = ".env.mcp";

/** Filename prefix on predecessor content artifacts, including learnings. */
export const PREDECESSOR_CONTENT_PREFIX = "hatch3r-";

/** Leading characters sniffed for a NUL before a candidate is treated as text. */
const BINARY_SNIFF_CHARS = 8192;

/** Written as an escape, not a literal, so the byte is visible in a diff. */
const NUL = "\u0000";

// ── Markers ──────────────────────────────────────────────────────

/** One BEGIN/END pair in a single host comment syntax. */
export interface PredecessorMarkerVariant {
  /** Host comment syntax the pair is written in. */
  readonly id: "html" | "hash" | "slash";
  /** Whole-line BEGIN matcher, applied to a whitespace-trimmed line. */
  readonly begin: RegExp;
  /** Whole-line END matcher for the same syntax. */
  readonly end: RegExp;
}

/**
 * The three syntaxes the predecessor emitted, in the order they are tried.
 *
 * Each matcher is anchored to a whole trimmed line and tolerates one optional
 * version-stamp token (`HATCH3R:BEGIN v2.8.6`) — the stamp is what the
 * predecessor's staleness check read, and a stamped marker must strip exactly
 * like a bare one. Prose that merely quotes a marker token mid-line is inert,
 * which is what keeps this document (and the migration doc) from being read as
 * a managed block by anything scanning with these patterns.
 *
 * Matchers are non-global on purpose: they are only ever used with `.test()`
 * against one line, so there is no `lastIndex` to reset between calls.
 */
export const PREDECESSOR_MARKER_VARIANTS: readonly PredecessorMarkerVariant[] = [
  {
    id: "html",
    begin: /^<!--[ \t]*HATCH3R:BEGIN(?:[ \t]+\S+)?[ \t]*-->$/,
    end: /^<!--[ \t]*HATCH3R:END(?:[ \t]+\S+)?[ \t]*-->$/,
  },
  {
    id: "hash",
    begin: /^#[ \t]*HATCH3R:BEGIN(?:[ \t]+\S+)?$/,
    end: /^#[ \t]*HATCH3R:END(?:[ \t]+\S+)?$/,
  },
  {
    id: "slash",
    begin: /^\/\/[ \t]*HATCH3R:BEGIN(?:[ \t]+\S+)?$/,
    end: /^\/\/[ \t]*HATCH3R:END(?:[ \t]+\S+)?$/,
  },
];

/**
 * Files the predecessor wrote managed blocks into, as repo-relative posix
 * paths. A trailing `*.ext` segment is expanded against the named directory,
 * one level deep and nothing more: the predecessor emitted per-rule files
 * directly under `.cursor/rules/`, and a recursive walk would drag in whatever
 * else a user keeps there.
 */
export const PREDECESSOR_MARKED_FILE_CANDIDATES: readonly string[] = [
  "AGENTS.md",
  "CLAUDE.md",
  "GEMINI.md",
  ".github/copilot-instructions.md",
  ".cursor/rules/*.mdc",
  ".cursor/rules/*.md",
];

// ── State ────────────────────────────────────────────────────────

/**
 * What the predecessor left in this repo.
 *
 * Directory and file members are absolute paths (they are reported to the
 * operator and opened by the carry half), while `markedFiles` holds
 * repo-relative posix paths — those are both what a report should print and
 * exactly what `./carry.ts::stripPredecessorBlocks` re-joins against a root.
 */
export interface PredecessorState {
  /** The state directory, or `null` when the repo only carries markers. */
  stateDirPath: string | null;
  /** The manifest, when a regular file exists at its path — readable or not. */
  manifestPath: string | null;
  /**
   * The parsed manifest, or `null` when it is absent, unreadable, not JSON, or
   * not a JSON object. Never validated against the predecessor's schema.
   */
  manifestRaw: Record<string, unknown> | null;
  /** The learnings directory, when it exists. */
  learningsDir: string | null;
  /** `.md` files in {@link learningsDir}; `0` when there is no directory. */
  learningsCount: number;
  /** The root MCP credential file, when it exists. */
  envMcpPath: string | null;
  /** The overrides directory, when it exists. Reported, never auto-mapped. */
  overridesDir: string | null;
  /**
   * Candidate files carrying at least one marker line, sorted, deduplicated.
   * Workspace packages contribute their own, prefixed with the package path
   * (`packages/web/CLAUDE.md`), which is the same repo-relative posix shape
   * `./carry.ts::stripPredecessorBlocks` re-joins against the root.
   */
  markedFiles: string[];
  /**
   * Workspace packages holding their own predecessor state directory, as
   * repo-relative posix paths, sorted. Empty for a single-package repo and for a
   * monorepo whose packages are clean.
   *
   * Reported rather than merged into {@link stateDirPath}: the carry reads one
   * state directory, and silently pointing it at a package's would migrate one
   * of twelve while implying all of them. What this field buys is that the
   * remainder is named instead of unmentioned.
   */
  packagesWithState: string[];
}

/**
 * Inspect `rootDir` for predecessor residue.
 *
 * Returns `null` only when the repo has no state directory, no marked file, and
 * no workspace package carrying either — the one case where there is nothing to
 * migrate and no migration moment to show. Every other combination returns a
 * state, including a state directory that is completely empty: that directory is
 * still evidence the operator ran the predecessor here, and the offer to strip
 * markers and re-init is still worth making.
 *
 * Nothing is written, and nothing is created to answer a question. Individual
 * read failures degrade the corresponding field rather than the pass: an
 * unreadable manifest is `manifestRaw: null` beside a `manifestPath` that says
 * the file is there, and a candidate file that cannot be read simply does not
 * join `markedFiles`. A workspace layout that cannot be read is no packages,
 * which degrades this pass to the root-only scan it used to be rather than
 * failing it.
 */
export async function detectPredecessorState(rootDir: string): Promise<PredecessorState | null> {
  const root = resolve(rootDir);
  const stateDir = join(root, PREDECESSOR_STATE_DIR);

  // Ahead of the fan-out below, because both the marker scan and the per-package
  // state probe are driven by it.
  const packages = await listWorkspacePackages(root);
  const [stateKind, markedFiles, packagesWithState] = await Promise.all([
    entryKind(stateDir),
    findMarkedFiles(root, packages),
    findPackagesWithState(root, packages),
  ]);
  const hasStateDir = stateKind === "dir";

  if (!hasStateDir && markedFiles.length === 0 && packagesWithState.length === 0) return null;

  const manifest = hasStateDir
    ? await readManifest(join(stateDir, PREDECESSOR_MANIFEST_FILE))
    : { path: null, raw: null };
  const [learnings, overridesDir, envMcpPath] = await Promise.all([
    hasStateDir
      ? readLearnings(join(stateDir, PREDECESSOR_LEARNINGS_DIR))
      : Promise.resolve({ dir: null, count: 0 }),
    hasStateDir
      ? existingDir(join(stateDir, PREDECESSOR_OVERRIDES_DIR))
      : Promise.resolve(null),
    existingFile(join(root, PREDECESSOR_ENV_MCP_FILE)),
  ]);

  return {
    stateDirPath: hasStateDir ? stateDir : null,
    manifestPath: manifest.path,
    manifestRaw: manifest.raw,
    learningsDir: learnings.dir,
    learningsCount: learnings.count,
    envMcpPath,
    overridesDir,
    markedFiles,
    packagesWithState,
  };
}

/**
 * True when `content` carries at least one whole-line predecessor marker, of
 * either end of a pair. An orphan END counts: it is residue the operator should
 * see reported, and the strip parser in `./carry.ts` decides separately whether
 * the pairing is safe to act on.
 */
export function hasPredecessorMarker(content: string): boolean {
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    for (const variant of PREDECESSOR_MARKER_VARIANTS) {
      if (variant.begin.test(trimmed) || variant.end.test(trimmed)) return true;
    }
  }
  return false;
}

// ── Internals ────────────────────────────────────────────────────

/**
 * Read the manifest tolerantly. `path` is reported whenever a regular file sits
 * there, so a report can distinguish "no manifest" from "a manifest we could
 * not read"; `raw` is populated only for a JSON object. A directory at the
 * manifest path is neither: nothing to open, nothing to report as a manifest.
 */
async function readManifest(
  path: string,
): Promise<{ path: string | null; raw: Record<string, unknown> | null }> {
  if ((await entryKind(path)) !== "file") return { path: null, raw: null };

  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch {
    // Permissions, a mid-pass delete, an I/O error: the file exists and its
    // contents do not reach us. Say exactly that.
    return { path, raw: null };
  }

  try {
    const parsed: unknown = JSON.parse(text);
    return { path, raw: isPlainRecord(parsed) ? parsed : null };
  } catch {
    return { path, raw: null };
  }
}

async function readLearnings(dir: string): Promise<{ dir: string | null; count: number }> {
  const names = await listDirFiles(dir);
  if (names === null) return { dir: null, count: 0 };
  return { dir, count: names.filter((name) => name.endsWith(".md")).length };
}

/**
 * Workspace packages of `root`, as repo-relative posix paths — the same list
 * `../detect/repoAnalyzer.ts` builds for the init panel, reused rather than
 * re-derived so a repo's package set means one thing across the run.
 *
 * Never throws. Detection is advisory: a workspace declaration that cannot be
 * read is no packages, which degrades this scan to the root-only pass it was
 * before rather than failing an init over a malformed `pnpm-workspace.yaml`.
 */
async function listWorkspacePackages(root: string): Promise<string[]> {
  try {
    return (await detectMonorepoPackages(root)).map((entry) => entry.path);
  } catch {
    return [];
  }
}

/** Packages holding their own {@link PREDECESSOR_STATE_DIR}, sorted. */
async function findPackagesWithState(
  root: string,
  packages: readonly string[],
): Promise<string[]> {
  const found = await Promise.all(
    packages.map(async (pkg) => {
      const dir = join(root, ...pkg.split("/"), PREDECESSOR_STATE_DIR);
      return (await entryKind(dir)) === "dir" ? pkg : null;
    }),
  );
  return found.filter((entry): entry is string => entry !== null).toSorted();
}

/**
 * Every candidate file that carries a marker, as repo-relative posix paths.
 *
 * The candidate list is expanded once per scope — the repo root, then each
 * workspace package — because the predecessor emits its instruction files into
 * every package of a monorepo, not only at the root. A package's rows carry the
 * package path as their prefix, so the strip parser re-joins them against the
 * same root as the root-level ones.
 *
 * Candidates are read concurrently — a handful per scope plus whatever one rules
 * directory holds — deduplicated (a package declared twice by overlapping globs
 * contributes its files once) and sorted, so a report is stable run to run.
 */
async function findMarkedFiles(root: string, packages: readonly string[]): Promise<string[]> {
  const scopes = ["", ...packages];
  const marked = await Promise.all(scopes.map((scope) => findMarkedFilesIn(root, scope)));
  return [...new Set(marked.flat())].toSorted();
}

/** Marked candidates under one scope, prefixed with it. `""` is the repo root. */
async function findMarkedFilesIn(root: string, scope: string): Promise<string[]> {
  const base = scope === "" ? root : join(root, ...scope.split("/"));
  const candidates = await expandCandidates(base);
  const marked = await Promise.all(
    candidates.map(async (relative) =>
      (await isMarked(join(base, relative))) ? (scope === "" ? relative : `${scope}/${relative}`) : null,
    ),
  );
  return marked.filter((entry): entry is string => entry !== null);
}

/** Candidate list with any `dir/*.ext` pattern resolved against the real tree. */
async function expandCandidates(root: string): Promise<string[]> {
  const expanded = await Promise.all(
    PREDECESSOR_MARKED_FILE_CANDIDATES.map(async (candidate) => {
      const star = candidate.lastIndexOf("*");
      if (star === -1) return [candidate];

      const slash = candidate.lastIndexOf("/");
      const dir = candidate.slice(0, slash);
      const suffix = candidate.slice(star + 1);
      const names = await listDirFiles(join(root, ...dir.split("/")));
      return (names ?? []).filter((name) => name.endsWith(suffix)).map((name) => `${dir}/${name}`);
    }),
  );
  return [...new Set(expanded.flat())];
}

/**
 * Whether one candidate file carries a marker. A file that cannot be read, or
 * that holds a NUL byte in its first block (so it is not the text file the
 * candidate list assumes), is not marked — never a throw, and never a rewrite
 * target for the strip pass that follows.
 */
async function isMarked(path: string): Promise<boolean> {
  let content: string;
  try {
    content = await readFile(path, "utf8");
  } catch {
    return false;
  }
  if (content.slice(0, BINARY_SNIFF_CHARS).includes(NUL)) return false;
  return hasPredecessorMarker(content);
}

/** File names directly under `dir`, or `null` when it is not a readable directory. */
async function listDirFiles(dir: string): Promise<string[] | null> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
  } catch {
    return null;
  }
}

type EntryKind = "file" | "dir" | "other" | null;

/**
 * What sits at `path`: `null` when nothing does, `"other"` when something does
 * but we cannot classify it or reach it. Detection is advisory, so a hostile or
 * broken repo degrades a field instead of throwing out of the pass.
 */
async function entryKind(path: string): Promise<EntryKind> {
  try {
    const stats = await stat(path);
    if (stats.isFile()) return "file";
    if (stats.isDirectory()) return "dir";
    return "other";
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return code === "ENOENT" || code === "ENOTDIR" ? null : "other";
  }
}

async function existingDir(path: string): Promise<string | null> {
  return (await entryKind(path)) === "dir" ? path : null;
}

async function existingFile(path: string): Promise<string | null> {
  return (await entryKind(path)) === "file" ? path : null;
}

/** A JSON object — not an array, not a scalar, not `null`. */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
