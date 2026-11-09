import type { Dirent } from "node:fs";
import { lstat, open, readdir } from "node:fs/promises";
import { join } from "node:path";
import { CLASS_FILE, parseClassFile } from "../change/classify.ts";
import { isPlainObject, parseYamlStrict } from "../config/parse.ts";
import type { LanguageVersion, RepoInfo } from "../types/detect.ts";
import { classifyFramework, classifyLanguage, type StackSupportTier } from "./stackSupport.ts";

/**
 * The ready report's checks (REQ-FLOW-182): whether a repository is ready for
 * unattended runs, read from files alone.
 *
 * Two halves. {@link assessReadiness} is pure: it decides every row from a
 * {@link RepoInfo} and a {@link ReadinessReads} bag. {@link readReadinessFiles}
 * is the read: it fills the file half of that bag from the root, every read a
 * capped `lstat`-checked regular file, every failure a named `unknown` or
 * `absent`, never a throw, and no process spawned. The bag's other half — the
 * charter gates, the land job's names and the setup's pin and commit — comes
 * from the caller, because the code that answers those lives in the CLI layer
 * (`src/cli/commands/check.ts`, `src/runs/preflight.ts`), which this engine
 * module may not import; each field is shaped so that code's own result passes
 * in unchanged.
 */

/** One row's verdict; only `gap` and `unknown` keep a repository from `ready`. */
type ReadinessState = "ready" | "gap" | "not-checked" | "unknown";

export type ReadinessCheckId =
  | "test-framework"
  | "gates-resolve"
  | "ci-provider"
  | "pr-workflow"
  | "land-job-workflows"
  | "lockfile"
  | "setup-pinned"
  | "tests-class"
  | "coverage"
  | "branch-rule";

interface ReadinessCheck {
  id: ReadinessCheckId;
  state: ReadinessState;
  evidence: string;
  fix: string;
}

/** A coverage report's totals: none on disk, read, or present and unreadable (`reason` says why). */
type CoverageRead =
  | { state: "absent" }
  | { state: "read"; file: string; linesPct: number }
  | { state: "unknown"; file: string; reason: string };

/** What {@link readReadinessFiles} reads from the root. */
export interface ReadinessFiles {
  /** Each workflow this engine did not write, repo-relative; `triggers` `null` when its `on:` could not be read. */
  workflows: { file: string; triggers: string[] | null }[];
  /** Root lockfiles present as regular files, in {@link LOCKFILES} order. */
  lockfiles: string[];
  /** `.stamity/change-classes.json`; `testGlobs` its `tests` class. */
  classFile: { state: "absent" } | { state: "unreadable"; reason: string } | { state: "read"; testGlobs: string[] };
  coverage: CoverageRead;
}

/**
 * The pure assessment's whole input: the file reads plus what the caller resolves.
 *
 * `gates` and `landJob` each take `"not-checked"` from a caller that does not run that check at all
 * (the pre-flight, which cannot import the CLI layer): the row reads `not-checked`, says so, and keeps
 * `ready` false, since the report cannot call ready what it did not look at. `null` stays a check that
 * was tried and gave no answer, which reads `unknown`.
 */
export interface ReadinessReads extends ReadinessFiles {
  /** `resolveCharterGates`'s report (its `unresolved` rows); `null` when it was not resolved; `"not-checked"` when not run. */
  gates: { unresolved: readonly { kind: string; value: string }[] } | "not-checked" | null;
  /**
   * `checkLandJobWorkflows`'s row; `"off"` where it returns none (the land job is off); `null` when not read;
   * `"not-checked"` when this caller does not run the check.
   */
  landJob: { status: "pass" | "warn" | "fail"; detail: string } | "off" | "not-checked" | null;
  /** The setup manifest: whether it reads, the CLI version it pins, and whether it is committed (`null`: not known). */
  setup: { manifest: "present" | "absent" | "unreadable"; pinnedVersion: string | null; committed: boolean | null };
}

export interface ReadinessReport {
  /** True when no row is a `gap` or `unknown`, and the caller ran every check it can skip (`gates`, `landJob`). */
  ready: boolean;
  checks: ReadinessCheck[];
  stack: {
    languages: string[];
    legacyStacks: string[];
    versions: LanguageVersion[];
    tiers: { subject: string; tier: StackSupportTier }[];
  };
  /** Line coverage from a report already on disk; `null` when none was read. */
  coverage: { file: string; linesPct: number } | null;
  /** The ids of the `not-checked` rows, in row order. */
  notChecked: ReadinessCheckId[];
}

/**
 * Workflows this engine writes, which prove nothing about the repository's own
 * pipeline. The same two names as `ENGINE_EMITTED_WORKFLOWS` in
 * `./repoAnalyzer.ts`, which does not export its set; a test holds the two equal.
 */
export const ENGINE_WORKFLOWS: ReadonlySet<string> = new Set(["copilot-setup-steps.yml", "stamity-land.yml"]);
const WORKFLOWS_DIR = ".github/workflows";
const WORKFLOW_EXTENSIONS: readonly string[] = [".yml", ".yaml"];
/** Bounds on the workflow read: files per folder and bytes per file. */
const WORKFLOW_MAX_FILES = 200;
const WORKFLOW_MAX_BYTES = 1024 * 1024;
/** The bytes read across all workflows together; a file past what is left reads as `triggers: null`. */
const WORKFLOW_TOTAL_BYTES = 16 * 1024 * 1024;
const CLASS_FILE_MAX_BYTES = 1024 * 1024;
/** Above this a coverage report is read only where its totals sit (head or tail), else `unknown`. */
const COVERAGE_MAX_BYTES = 5 * 1024 * 1024;
/** How much of a huge report's head or tail is read for its totals. */
const COVERAGE_EDGE_BYTES = 64 * 1024;

/**
 * Lockfiles by the language that writes them. A language with no lockfile
 * convention (Java with Maven, C and C++, and the rest) is not in the table, so
 * it never reads as a gap.
 */
const LOCKFILES: readonly { file: string; languages: readonly string[] }[] = [
  ...["pnpm-lock.yaml", "yarn.lock", "bun.lock", "bun.lockb", "package-lock.json", "npm-shrinkwrap.json"].map(
    (file) => ({ file, languages: ["typescript", "javascript"] }),
  ),
  ...["uv.lock", "poetry.lock", "Pipfile.lock", "pdm.lock"].map((file) => ({ file, languages: ["python"] })),
  { file: "Cargo.lock", languages: ["rust"] },
  { file: "go.sum", languages: ["go"] },
  { file: "Gemfile.lock", languages: ["ruby"] },
  { file: "composer.lock", languages: ["php"] },
  { file: "packages.lock.json", languages: ["csharp"] },
  { file: "pubspec.lock", languages: ["dart"] },
  { file: "mix.lock", languages: ["elixir"] },
  { file: "Package.resolved", languages: ["swift"] },
  { file: "cpanfile.snapshot", languages: ["perl"] },
];

type CoverageFormat = "istanbul" | "lcov" | "cobertura" | "jacoco";

/** The coverage reports read, first present wins; totals only. */
export const COVERAGE_REPORTS: readonly { file: string; format: CoverageFormat }[] = [
  { file: "coverage/coverage-summary.json", format: "istanbul" },
  { file: "coverage/lcov.info", format: "lcov" },
  { file: "coverage.xml", format: "cobertura" },
  { file: "target/site/jacoco/jacoco.xml", format: "jacoco" },
  { file: "build/reports/jacoco/test/jacocoTestReport.xml", format: "jacoco" },
];

const BRANCH_RULE_FIX = "stamity gate preflight --unattended --dry-run";

/** Decide every readiness row from what detection and the reads found. Pure: nothing is read, nothing mutated. */
export function assessReadiness(info: RepoInfo, reads: ReadinessReads): ReadinessReport {
  const checks: ReadinessCheck[] = [
    testFramework(info),
    gatesResolve(reads.gates),
    ciProvider(info),
    prWorkflow(info, reads.workflows),
    landJob(reads.landJob),
    lockfile(info, reads.lockfiles),
    setupPinned(reads.setup),
    testsClass(reads.classFile),
    coverageCheck(reads.coverage),
    {
      id: "branch-rule",
      state: "not-checked",
      evidence: "the branch rule lives on the host, and this report reads files only",
      fix: BRANCH_RULE_FIX,
    },
  ];
  const callerSkipped = reads.gates === "not-checked" || reads.landJob === "not-checked";
  return {
    ready: !callerSkipped && checks.every((row) => row.state === "ready" || row.state === "not-checked"),
    checks,
    stack: {
      languages: [...info.languages],
      legacyStacks: [...info.legacyStacks],
      versions: (info.languageVersions ?? []).map(({ language, version, source }) => ({ language, version, source })),
      tiers: [
        ...info.languages.map((subject) => ({ subject, tier: classifyLanguage(subject).tier })),
        ...info.frameworks.map((subject) => ({ subject, tier: classifyFramework(subject).tier })),
      ],
    },
    coverage:
      reads.coverage.state === "read" ? { file: reads.coverage.file, linesPct: reads.coverage.linesPct } : null,
    notChecked: checks.filter((row) => row.state === "not-checked").map((row) => row.id),
  };
}

function testFramework(info: RepoInfo): ReadinessCheck {
  const id = "test-framework";
  return info.testFrameworks.length > 0
    ? { id, state: "ready", evidence: `detected: ${info.testFrameworks.join(", ")}`, fix: "none needed" }
    : {
        id,
        state: "gap",
        evidence: "no test framework detected at the root",
        fix: "add a test framework and its config at the root, so runs have tests to prove a change",
      };
}

function gatesResolve(gates: ReadinessReads["gates"]): ReadinessCheck {
  const id = "gates-resolve";
  const fix = "pin each gate in the setup manifest (stamity config), or install the tool it names";
  if (gates === "not-checked") {
    return { id, state: "not-checked", evidence: "not checked by this caller", fix: "run stamity ready" };
  }
  if (gates === null) {
    return { id, state: "unknown", evidence: "the charter gates were not resolved (no readable setup manifest)", fix };
  }
  if (gates.unresolved.length === 0) {
    return { id, state: "ready", evidence: "every charter gate names a command this machine can find", fix: "none needed" };
  }
  const rows = gates.unresolved.map((row) => `${row.kind}: ${row.value || "(none)"}`).join("; ");
  return { id, state: "gap", evidence: `unresolved: ${rows}`, fix };
}

function ciProvider(info: RepoInfo): ReadinessCheck {
  const id = "ci-provider";
  return info.ciProviders.length > 0
    ? { id, state: "ready", evidence: `detected: ${info.ciProviders.join(", ")}`, fix: "none needed" }
    : {
        id,
        state: "gap",
        evidence: "no CI configuration detected",
        fix: "add a CI pipeline that runs the gates on every pull request",
      };
}

function prWorkflow(info: RepoInfo, workflows: ReadinessFiles["workflows"]): ReadinessCheck {
  const id = "pr-workflow";
  const fix = `add a workflow under ${WORKFLOWS_DIR}/ that runs the gates on: pull_request`;
  if (!info.ciProviders.includes("github-actions")) {
    const others = info.ciProviders.length > 0 ? info.ciProviders.join(", ") : "no CI provider";
    return {
      id,
      state: "gap",
      evidence: `${others}: a pull request carries a commit status only, which the land job does not read`,
      fix,
    };
  }
  const running = workflows.filter((entry) => entry.triggers?.includes("pull_request") === true);
  if (running.length > 0) {
    return { id, state: "ready", evidence: `on pull_request: ${running.map((entry) => entry.file).join(", ")}`, fix: "none needed" };
  }
  const unread = workflows.filter((entry) => entry.triggers === null);
  if (unread.length > 0) {
    return {
      id,
      state: "unknown",
      evidence: `no workflow read runs on pull_request; unreadable: ${unread.map((entry) => entry.file).join(", ")}`,
      fix: "make each workflow valid YAML with an on: key, then re-run",
    };
  }
  return { id, state: "gap", evidence: "no workflow runs on pull_request", fix };
}

function landJob(row: ReadinessReads["landJob"]): ReadinessCheck {
  const id = "land-job-workflows";
  if (row === "off") {
    return {
      id,
      state: "not-checked",
      evidence: "the land job is off (autonomy.landJob not set)",
      fix: "set autonomy.landJob with the workflow names it waits on, if runs should land themselves",
    };
  }
  if (row === "not-checked") {
    return { id, state: "not-checked", evidence: "not checked by this caller", fix: "run stamity ready" };
  }
  if (row === null) {
    return { id, state: "unknown", evidence: "the land job's workflow names were not read", fix: "run stamity check" };
  }
  return row.status === "pass"
    ? { id, state: "ready", evidence: row.detail, fix: "none needed" }
    : {
        id,
        state: "gap",
        evidence: row.detail,
        fix: "rename autonomy.landJob.workflows to the names your workflow files carry",
      };
}

function lockfile(info: RepoInfo, present: readonly string[]): ReadinessCheck {
  const id = "lockfile";
  const expected = info.languages.filter((language) => LOCKFILES.some((row) => row.languages.includes(language)));
  if (expected.length === 0) {
    return {
      id,
      state: "not-checked",
      evidence: "no detected language has a lockfile convention this report knows",
      fix: "commit whatever pins your dependency versions",
    };
  }
  const missing = expected.filter(
    (language) => !LOCKFILES.some((row) => row.languages.includes(language) && present.includes(row.file)),
  );
  return missing.length === 0
    ? { id, state: "ready", evidence: `present: ${present.join(", ")}`, fix: "none needed" }
    : {
        id,
        state: "gap",
        evidence: `no lockfile for ${missing.join(", ")}`,
        fix: "commit the lockfile your package manager writes, so a run installs the versions you tested",
      };
}

function setupPinned(setup: ReadinessReads["setup"]): ReadinessCheck {
  const id = "setup-pinned";
  if (setup.manifest === "absent") {
    return { id, state: "gap", evidence: "no setup manifest (.stamity/manifest.json)", fix: "run stamity init, then commit .stamity/" };
  }
  if (setup.manifest === "unreadable") {
    return { id, state: "unknown", evidence: "the setup manifest could not be read", fix: "run stamity sync to rewrite it" };
  }
  if (setup.pinnedVersion === null) {
    return { id, state: "gap", evidence: "the setup manifest pins no CLI version", fix: "run stamity sync so it records the pinned version" };
  }
  if (setup.committed === false) {
    return {
      id,
      state: "gap",
      evidence: `pinned to ${setup.pinnedVersion}, but the setup is not committed`,
      fix: "commit .stamity/ and the files the setup wrote, so a fresh clone carries them",
    };
  }
  if (setup.committed === null) {
    return {
      id,
      state: "unknown",
      evidence: `pinned to ${setup.pinnedVersion}; whether the setup is committed was not read`,
      fix: "commit .stamity/ and the files the setup wrote",
    };
  }
  return { id, state: "ready", evidence: `committed and pinned to ${setup.pinnedVersion}`, fix: "none needed" };
}

function testsClass(classFile: ReadinessFiles["classFile"]): ReadinessCheck {
  const id = "tests-class";
  const fix = `add a "tests" class to ${CLASS_FILE} naming where your tests live`;
  if (classFile.state === "absent") return { id, state: "gap", evidence: `no ${CLASS_FILE}`, fix };
  if (classFile.state === "unreadable") {
    return { id, state: "unknown", evidence: `${CLASS_FILE} is refused: ${classFile.reason}`, fix: `fix ${CLASS_FILE}, then re-run` };
  }
  return classFile.testGlobs.length > 0
    ? { id, state: "ready", evidence: `tests: ${classFile.testGlobs.join(", ")}`, fix: "none needed" }
    : { id, state: "gap", evidence: `${CLASS_FILE} has no tests class`, fix };
}

function coverageCheck(coverage: CoverageRead): ReadinessCheck {
  const id = "coverage";
  if (coverage.state === "read") {
    return { id, state: "ready", evidence: `${coverage.linesPct}% of lines, from ${coverage.file}`, fix: "none needed" };
  }
  if (coverage.state === "unknown") {
    return { id, state: "unknown", evidence: `${coverage.file}: ${coverage.reason}`, fix: "re-run your coverage so the report is whole" };
  }
  return {
    id,
    state: "not-checked",
    evidence: "no coverage report on disk; this report never runs one",
    fix: "run your tests with coverage once, so a summary is on disk",
  };
}

// ── The reads ──────────────────────────────────────────────────────────────

/** Read the file half of {@link ReadinessReads} from `rootDir`. Never throws; spawns nothing. */
export async function readReadinessFiles(rootDir: string): Promise<ReadinessFiles> {
  const [workflows, lockfiles, classFile, coverage] = await Promise.all([
    readWorkflows(rootDir),
    readLockfiles(rootDir),
    readClassFile(rootDir),
    readCoverage(rootDir),
  ]);
  return { workflows, lockfiles, classFile, coverage };
}

async function readWorkflows(rootDir: string): Promise<ReadinessFiles["workflows"]> {
  let entries: Dirent[];
  try {
    entries = await readdir(join(rootDir, WORKFLOWS_DIR), { withFileTypes: true });
  } catch {
    return [];
  }
  const names = entries
    .filter(
      (entry) =>
        entry.isFile() &&
        WORKFLOW_EXTENSIONS.some((ext) => entry.name.toLowerCase().endsWith(ext)) &&
        !ENGINE_WORKFLOWS.has(entry.name),
    )
    .map((entry) => entry.name)
    .toSorted()
    .slice(0, WORKFLOW_MAX_FILES);
  // Sizes first, then each file a share of one total budget in name order, so the reads below hold at
  // most that budget at once; a file that grew after its size was taken reads past its share as truncated.
  const sizes = await Promise.all(names.map((name) => regularSize(join(rootDir, WORKFLOWS_DIR, name))));
  let left = WORKFLOW_TOTAL_BYTES;
  const shares = sizes.map((size) => {
    if (size === null || size > WORKFLOW_MAX_BYTES || size > left) return null;
    left -= size;
    return size;
  });
  return Promise.all(
    names.map(async (name, index) => {
      const file = `${WORKFLOWS_DIR}/${name}`;
      const share = shares[index] ?? null;
      const read = share === null ? null : await readHead(join(rootDir, file), share);
      return { file, triggers: read === null || read.truncated ? null : workflowTriggers(read.text, file) };
    }),
  );
}

/** The events a workflow's `on:` names, in its order; `null` when the file does not parse or has no `on:`. */
function workflowTriggers(text: string, file: string): string[] | null {
  let doc: unknown;
  try {
    doc = parseYamlStrict(text, file);
  } catch {
    return null;
  }
  const on = isPlainObject(doc) ? doc["on"] : undefined;
  if (typeof on === "string") return [on];
  if (Array.isArray(on)) return on.filter((event): event is string => typeof event === "string");
  if (isPlainObject(on)) return Object.keys(on);
  return null;
}

async function readLockfiles(rootDir: string): Promise<string[]> {
  const present = await Promise.all(LOCKFILES.map(async (row) => ((await isRegularFile(join(rootDir, row.file))) ? row.file : null)));
  return present.filter((file): file is string => file !== null);
}

async function readClassFile(rootDir: string): Promise<ReadinessFiles["classFile"]> {
  const path = join(rootDir, CLASS_FILE);
  if (!(await exists(path))) return { state: "absent" };
  const read = await readHead(path, CLASS_FILE_MAX_BYTES);
  if (read === null) return { state: "unreadable", reason: "not a regular file, or it does not read" };
  if (read.truncated) return { state: "unreadable", reason: "over 1 MB" };
  const parsed = parseClassFile(read.text);
  return parsed.ok
    ? { state: "read", testGlobs: parsed.testGlobs }
    : { state: "unreadable", reason: parsed.errors[0] ?? "refused" };
}

async function readCoverage(rootDir: string): Promise<CoverageRead> {
  const present = await Promise.all(COVERAGE_REPORTS.map((report) => exists(join(rootDir, report.file))));
  const report = COVERAGE_REPORTS.find((_, index) => present[index] === true);
  if (report === undefined) return { state: "absent" };
  const pct = await coverageTotals(join(rootDir, report.file), report.format);
  return typeof pct === "number"
    ? { state: "read", file: report.file, linesPct: pct }
    : { state: "unknown", file: report.file, reason: pct.reason };
}

/** A report's line percentage, or why none was read. */
async function coverageTotals(path: string, format: CoverageFormat): Promise<number | { reason: string }> {
  const unreadable = { reason: "not a regular file, or it does not read" };
  // Cobertura's totals sit on the root element and JaCoCo's close the file, so
  // those two read only the edge that holds them, whatever the size.
  if (format === "cobertura") {
    const head = await readHead(path, COVERAGE_EDGE_BYTES);
    if (head === null) return unreadable;
    const rate = /<coverage\b[^>]*?\sline-rate="([0-9.]+)"/.exec(head.text)?.[1];
    return percent(rate === undefined ? Number.NaN : Number(rate) * 100, "no line-rate on its root element");
  }
  if (format === "jacoco") {
    const tail = await readTail(path, COVERAGE_EDGE_BYTES);
    if (tail === null) return unreadable;
    const counters = [...tail.matchAll(/<counter\s+type="LINE"\s+missed="(\d+)"\s+covered="(\d+)"\s*\/>/g)];
    const last = counters.at(-1);
    if (last === undefined) return { reason: "no report-level LINE counter" };
    return ratio(Number(last[2]), Number(last[1]) + Number(last[2]));
  }
  const read = await readHead(path, COVERAGE_MAX_BYTES);
  if (read === null) return unreadable;
  if (read.truncated) return { reason: "over 5 MB with no totals line" };
  if (format === "lcov") {
    let found = 0;
    let hit = 0;
    for (const line of read.text.split(/\r?\n/)) {
      if (line.startsWith("LF:")) found += Number(line.slice(3));
      else if (line.startsWith("LH:")) hit += Number(line.slice(3));
    }
    return ratio(hit, found);
  }
  let summary: unknown;
  try {
    summary = JSON.parse(read.text);
  } catch {
    return { reason: "not valid JSON" };
  }
  const total = isPlainObject(summary) ? summary["total"] : undefined;
  const lines = isPlainObject(total) ? total["lines"] : undefined;
  const pct = isPlainObject(lines) ? lines["pct"] : undefined;
  return percent(typeof pct === "number" ? pct : Number.NaN, "no numeric total.lines.pct");
}

function ratio(covered: number, total: number): number | { reason: string } {
  if (!Number.isFinite(covered) || !Number.isFinite(total) || total <= 0) return { reason: "no lines counted" };
  return percent((covered / total) * 100, "no lines counted");
}

/** A percentage rounded to two places, or `reason` when it is not one. */
function percent(value: number, reason: string): number | { reason: string } {
  if (!Number.isFinite(value) || value < 0 || value > 100) return { reason };
  return Math.round(value * 100) / 100;
}

// ── Capped reads of regular files ──────────────────────────────────────────

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch {
    return false;
  }
}

/** A regular file's size, or `null` when the path is not one. */
async function regularSize(path: string): Promise<number | null> {
  try {
    const stats = await lstat(path);
    return stats.isFile() ? stats.size : null;
  } catch {
    return null;
  }
}

async function isRegularFile(path: string): Promise<boolean> {
  try {
    return (await lstat(path)).isFile();
  } catch {
    return false;
  }
}

/**
 * Up to `maxBytes` from the start of a regular file (a link, a FIFO or a device
 * is refused before it is opened, and re-checked on the handle), `truncated`
 * when more was there; `null` when it is not one or does not read. The buffer
 * is the file's size, at most `maxBytes`, plus the one byte that shows more.
 */
async function readHead(path: string, maxBytes: number): Promise<{ text: string; truncated: boolean } | null> {
  const opened = await openRegular(path);
  if (opened === null) return null;
  const { handle, size } = opened;
  try {
    const buffer = Buffer.alloc(Math.min(size, maxBytes) + 1);
    let filled = 0;
    while (filled < buffer.length) {
      // eslint-disable-next-line no-await-in-loop -- one descriptor read in order: each read starts where the last one ended
      const { bytesRead } = await handle.read(buffer, filled, buffer.length - filled, filled);
      if (bytesRead === 0) break;
      filled += bytesRead;
    }
    // A full buffer is one byte past the handle's size or past `maxBytes`: more was there than was read.
    return { text: buffer.toString("utf8", 0, Math.min(filled, maxBytes)), truncated: filled === buffer.length };
  } catch {
    return null;
  } finally {
    await handle.close().catch(() => undefined);
  }
}

/** The last `maxBytes` of a regular file, or `null` as {@link readHead}. */
async function readTail(path: string, maxBytes: number): Promise<string | null> {
  const opened = await openRegular(path);
  if (opened === null) return null;
  const { handle, size } = opened;
  try {
    const start = Math.max(0, size - maxBytes);
    const buffer = Buffer.alloc(Math.min(size, maxBytes));
    let filled = 0;
    while (filled < buffer.length) {
      // eslint-disable-next-line no-await-in-loop -- one descriptor read in order: each read starts where the last one ended
      const { bytesRead } = await handle.read(buffer, filled, buffer.length - filled, start + filled);
      if (bytesRead === 0) break;
      filled += bytesRead;
    }
    return buffer.toString("utf8", 0, filled);
  } catch {
    return null;
  } finally {
    await handle.close().catch(() => undefined);
  }
}

/** A read handle on a regular file and the size its own `stat` gave, or `null`. */
async function openRegular(path: string): Promise<{ handle: Awaited<ReturnType<typeof open>>; size: number } | null> {
  try {
    if (!(await lstat(path)).isFile()) return null;
    const handle = await open(path, "r");
    const stats = await handle.stat().catch(() => null);
    if (stats?.isFile() === true) return { handle, size: stats.size };
    await handle.close().catch(() => undefined);
    return null;
  } catch {
    return null;
  }
}
