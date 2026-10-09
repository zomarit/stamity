/**
 * Test selection (REQ-FLOW-062): which tests a change needs, from the class
 * file's test-input map and the files each test source names.
 *
 * **Reads.** A test that reads a file outside the import graph (a docs page, a
 * fixture, a run record) is invisible to a selection by imports, so a test's
 * reads are taken from its own text ({@link extractReadPaths}): every string
 * literal that names a tracked non-code file, and every glob literal, which
 * names each tracked non-code file it matches. A path built at run time is not
 * seen; the full run on a schedule and "unclear means product" back that up.
 *
 * **Selection** ({@link selectTests}) only ever widens toward every test. A
 * changed helper or fixture under a test glob, a missing or empty map (S4), a
 * map entry that says `"all"`, or a helper whose source names a changed path
 * runs every test, since no list of its importers exists here. Otherwise the
 * selection is the union of the map's matching entries, the tests whose source
 * names a changed path (which only adds), and the changed test files; for a
 * `records` or `docs` change zero stays zero, and for any other class zero
 * selected runs every test.
 *
 * Pure: no filesystem, no git, and one internal import, the classifier
 * (`./classify.ts`, wave 2). The verb in `../cli/commands/gate.ts` reads the
 * map from the base commit and the test sources from the work tree.
 */
import { posix } from "node:path";
import { BUILT_IN_TEST_GLOBS, CODE_EXTENSIONS, matchGlob, type ChangeClass } from "./classify.ts";

/** One map entry: a glob over changed paths and the tests it selects, or every test. */
export interface TestInputEntry {
  glob: string;
  tests: readonly string[] | "all";
}

/** One test source and the paths it reads, as {@link extractReadPaths} found them. */
export interface TestSource {
  test: string;
  reads: readonly string[];
}

export interface TestSelectionInput {
  paths: readonly string[];
  class: ChangeClass;
  /** The base commit's test-input map; absent or empty runs every test (S4). */
  map?: readonly TestInputEntry[];
  testSources?: readonly TestSource[];
  /** The class file's `tests` globs; the built-in ones are always added. */
  testGlobs: readonly string[];
}

export interface TestSelection {
  full: boolean;
  files: string[];
  reason: string;
}

/** A glob literal is at most this long and holds no whitespace, so prose with a `*` is no pattern. */
const GLOB_LITERAL_MAX = 200;

/** The test-file names the runners pick up: `<name>.test.<ext>` and `<name>.spec.<ext>`. */
const TEST_FILE_GLOBS: readonly string[] = ["**/*.test.*", "**/*.spec.*"];

const QUOTES: readonly string[] = ['"', "'", "`"];

/** A line that opens with a comment marker: a doc-comment body, a block opener or a line comment. */
const COMMENT_LINE = /^\s*(?:\/\/|\/\*|\*)/;

function isCodeFile(path: string): boolean {
  return CODE_EXTENSIONS.includes(posix.extname(path).toLowerCase());
}

/** Whether `path` matches `glob` by either reading: `\` as a separator, or as a filename character. */
function matchesEither(path: string, glob: string): boolean {
  return matchGlob(path, glob) || matchGlob(path, glob, { literal: true });
}

function underAny(path: string, globs: readonly string[]): boolean {
  return globs.some((glob) => matchesEither(path, glob));
}

/** A test file a runner runs: a code file named `*.test.*` or `*.spec.*`. Any other file under a test glob is a helper or a fixture. */
function isTestFile(path: string): boolean {
  return isCodeFile(path) && underAny(path, TEST_FILE_GLOBS);
}

/** A test source whose reads count: a code file under a test glob (a built-in one or one of `testGlobs`), helpers included. */
export function isTestSource(path: string, testGlobs: readonly string[]): boolean {
  return isCodeFile(path) && underAny(path, [...BUILT_IN_TEST_GLOBS, ...testGlobs]);
}

/**
 * Every span between two neighbouring quotes of one kind on one line. A
 * superset of the line's string literals: an apostrophe in prose opens a span
 * that ends at the next one, and the next span still starts there, so it never
 * swallows a literal after it. Only spans naming a tracked file count.
 */
function quotedSpans(source: string): Set<string> {
  const spans = new Set<string>();
  for (const line of source.split(/\r?\n/)) {
    if (COMMENT_LINE.test(line)) continue;
    for (const quote of QUOTES) {
      const parts = line.split(quote);
      for (let index = 1; index < parts.length - 1; index += 1) spans.add(parts[index] ?? "");
    }
  }
  return spans;
}

/** A literal written relative to the test file, its leading `./` and `../` segments dropped. */
function repositoryForm(literal: string): string {
  let path = literal;
  while (path.startsWith("./") || path.startsWith("../")) path = path.slice(path.indexOf("/") + 1);
  return path;
}

/** A glob made only of `*` segments matches every path and names none of its own. */
function onlyWildcards(glob: string): boolean {
  return glob.split("/").every((segment) => /^\*+$/.test(segment));
}

/**
 * The tracked non-code files a test source names (`plan/4`), sorted: each
 * string literal that is a tracked path, read with its leading `./` and `../`
 * dropped, and each glob literal's tracked matches. A literal no tracked file
 * has (a scratch repository's `"content/x.md"`) is no read, and neither is a
 * code file, which the import graph reaches, nor a path a comment line names.
 */
export function extractReadPaths(testSource: string, tracked: ReadonlySet<string>): string[] {
  let readable: string[] | undefined;
  const reads = new Set<string>();
  for (const span of quotedSpans(testSource)) {
    const path = repositoryForm(span);
    if (path === "" || isCodeFile(path)) continue;
    if (!path.includes("*")) {
      if (tracked.has(path)) reads.add(path);
      continue;
    }
    if (path.length > GLOB_LITERAL_MAX || /\s/.test(path) || onlyWildcards(path)) continue;
    readable ??= [...tracked].filter((candidate) => !isCodeFile(candidate));
    for (const candidate of readable) if (matchGlob(candidate, path, { literal: true })) reads.add(candidate);
  }
  return [...reads].toSorted();
}

/** At most this many paths are named in one reason; the rest are counted. */
const PATHS_NAMED = 5;

function namePaths(paths: readonly string[]): string {
  const named = paths.slice(0, PATHS_NAMED).join(", ");
  return paths.length > PATHS_NAMED ? `${named} and ${paths.length - PATHS_NAMED} more` : named;
}

function everyTest(reason: string): TestSelection {
  return { full: true, files: [], reason: `${reason}, so every test runs` };
}

/** Classes whose zero selected tests stay zero: their suites are the ones that read them. */
const ZERO_STAYS_ZERO: ReadonlySet<ChangeClass> = new Set(["records", "docs"]);

/**
 * The tests a change needs (S4), in this order: a changed helper or fixture
 * under a test glob runs every test (`plan/41`); no map, or an empty one, runs
 * every test; then the union of the map's entries whose glob matches a changed
 * path (an `"all"` entry runs every test), the test sources naming a changed
 * path (`plan/3`; a helper among them runs every test), and the changed test
 * files (`plan/24`). Zero selected stays zero for `records` and `docs` and runs
 * every test for any other class.
 */
export function selectTests(input: TestSelectionInput): TestSelection {
  const testGlobs = [...BUILT_IN_TEST_GLOBS, ...input.testGlobs];
  const helpers = input.paths.filter((path) => underAny(path, testGlobs) && !isTestFile(path));
  if (helpers.length > 0) return everyTest(`a changed helper or fixture under a test glob: ${namePaths(helpers)}`);
  const map = input.map ?? [];
  if (map.length === 0) return everyTest("the base holds no test-input map");

  const selected = new Set<string>();
  const counts = { map: 0, sources: 0, changed: 0 };
  for (const entry of map) {
    const matched = input.paths.find((path) => matchesEither(path, entry.glob));
    if (matched === undefined) continue;
    if (entry.tests === "all") return everyTest(`the map entry ${entry.glob} selects every test and matches ${matched}`);
    for (const test of entry.tests) selected.add(test);
    counts.map += 1;
  }
  const changed = new Set(input.paths.flatMap((path) => [path, path.replaceAll("\\", "/")]));
  for (const source of input.testSources ?? []) {
    const named = source.reads.find((read) => changed.has(read));
    if (named === undefined) continue;
    if (!isTestFile(source.test)) {
      return everyTest(`the helper ${source.test} names the changed ${named}, and no test importing it can be named`);
    }
    selected.add(source.test);
    counts.sources += 1;
  }
  for (const path of input.paths) {
    if (!isTestFile(path)) continue;
    selected.add(path);
    counts.changed += 1;
  }

  if (selected.size === 0) {
    if (!ZERO_STAYS_ZERO.has(input.class)) return everyTest(`no test was selected for a ${input.class} change`);
    return { full: false, files: [], reason: `no test reads the changed ${input.class} paths` };
  }
  const files = [...selected].toSorted();
  return {
    full: false,
    files,
    reason:
      `${files.length} selected: ${counts.map} map entries, ${counts.sources} test sources naming a changed path, ` +
      `${counts.changed} changed test files`,
  };
}
